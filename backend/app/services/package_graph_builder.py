"""Recursive graph builder for package dependency tracing.

Fetches package metadata from registries (npm, PyPI), resolves to GitHub
for contributor attribution, and assembles a weighted attribution graph.
Mirrors the structure of graph_builder.py but starts from a package name
instead of a repository URL.
"""

import asyncio
import logging
import re
from typing import Any, Dict, List, Optional, Set, Tuple

from app.config import settings
from app.schemas.graph import Edge, Graph, GraphConfig, Node, NodeType
from app.services import llm
from app.services.github import (
    fetch_contributor_stats,
    fetch_readme,
    fetch_repo_metadata,
    parse_repo_owner_and_name,
)
from app.services.package_registry import PackageInfo, fetch_package_info
from app.services.parsers.manifest import Dependency
from app.services.registry import resolve_to_github_url

logger = logging.getLogger(__name__)


class PackageGraphBuilder:
    """Builds a contribution attribution graph starting from a package name."""

    def __init__(
        self,
        max_depth: int,
        max_children: int,
        decay: float = 0.8,
    ):
        self.max_depth = max_depth
        self.max_children = max_children
        self.decay = decay
        self.nodes: List[Node] = []
        self.edges: List[Edge] = []
        self._visited: Set[str] = set()

    async def build(self, package_name: str, ecosystem: str) -> Graph:
        """Build the full graph starting from a package name."""
        logger.info(
            "========== Building package graph for %s:%s (depth=%d, children=%d) ==========",
            ecosystem,
            package_name,
            self.max_depth,
            self.max_children,
        )
        await self._build_node(
            package_name, ecosystem, depth=self.max_depth, parent_id=None
        )

        await self._ensure_contributor_leaves()

        logger.info(
            "========== Package graph complete: %d nodes, %d edges ==========",
            len(self.nodes),
            len(self.edges),
        )
        return Graph(nodes=self.nodes, edges=self.edges)

    # ------------------------------------------------------------------
    # Name normalisation (for consistent IDs and deduplication)
    # ------------------------------------------------------------------

    @staticmethod
    def _norm(name: str, ecosystem: str) -> str:
        """Normalise a package name for use in node IDs and visit tracking."""
        if ecosystem == "pypi":
            return re.sub(r"[-_.]+", "-", name).lower()
        return name.lower()

    # ------------------------------------------------------------------
    # Core recursive builder
    # ------------------------------------------------------------------

    async def _build_node(
        self,
        package_name: str,
        ecosystem: str,
        depth: int,
        parent_id: Optional[str],
    ) -> Optional[str]:
        """Build a single package node and its children. Returns the node id."""
        norm = self._norm(package_name, ecosystem)
        cache_key = "{}:{}".format(ecosystem, norm)

        if cache_key in self._visited:
            logger.info("[PKGGRAPH] Skipping %s (already visited)", cache_key)
            return None
        self._visited.add(cache_key)

        is_root = parent_id is None
        node_id = (
            "pkg:{}".format(norm)
            if is_root
            else "bow:{}:{}".format(ecosystem, norm)
        )

        node_type = NodeType.PACKAGE if is_root else NodeType.BODY_OF_WORK
        self.nodes.append(Node(id=node_id, type=node_type, label=package_name))

        mode = "FULL (registry+LLM)" if is_root else "LIGHT (registry only)"
        logger.info("[PKGGRAPH] ── %s depth=%d mode=%s", cache_key, depth, mode)

        try:
            if is_root:
                await self._build_with_full_analysis(
                    package_name, ecosystem, node_id, depth
                )
            else:
                await self._build_lightweight(
                    package_name, ecosystem, node_id, depth
                )
        except Exception as exc:
            logger.warning("Analysis failed for %s: %s", cache_key, exc)
            github_url = await self._resolve_github_safe(package_name, ecosystem)
            if github_url:
                try:
                    owner, repo = parse_repo_owner_and_name(github_url)
                    await self._add_contributor_leaves(owner, repo, node_id)
                except Exception:
                    pass

        return node_id

    # ------------------------------------------------------------------
    # Full analysis (root package): registry + GitHub + LLM
    # ------------------------------------------------------------------

    async def _build_with_full_analysis(
        self,
        package_name: str,
        ecosystem: str,
        node_id: str,
        depth: int,
    ) -> None:
        """Full analysis path: fetch registry data, resolve GitHub, use LLM."""
        pkg_info = await fetch_package_info(package_name, ecosystem)

        logger.info(
            "[PKGGRAPH] Phase 1: collecting data for %s:%s ...", ecosystem, package_name
        )

        github_url = pkg_info.github_url
        if not github_url:
            github_url = await self._resolve_github_safe(package_name, ecosystem)

        readme = ""
        metadata: Dict[str, Any] = {}
        if github_url:
            try:
                owner, repo = parse_repo_owner_and_name(github_url)
                metadata_task = fetch_repo_metadata(owner, repo)
                readme_task = fetch_readme(owner, repo)
                metadata, readme = await asyncio.gather(metadata_task, readme_task)
            except Exception as exc:
                logger.warning(
                    "[PKGGRAPH] GitHub data fetch failed for %s: %s",
                    package_name,
                    exc,
                )

        prod_deps = [d for d in pkg_info.dependencies if not d.dev_only]
        if not prod_deps and pkg_info.dependencies:
            logger.info(
                "[PKGGRAPH] No prod deps; using %d dev deps for analysis",
                len(pkg_info.dependencies),
            )
            prod_deps = pkg_info.dependencies
        dep_names = [d.name for d in prod_deps]
        logger.info(
            "[PKGGRAPH] Phase 1 done: %s@%s, %d deps (%d analysable)",
            package_name,
            pkg_info.latest_version or "?",
            len(pkg_info.dependencies),
            len(dep_names),
        )

        if True:
            logger.info(
                "[PKGGRAPH] Phase 2: running LLM analysis for %s ...", package_name
            )
            pkg_analysis = await llm.analyze_package(
                pkg_info.description,
                pkg_info.keywords,
                dep_names,
                readme,
                metadata,
            )

            if dep_names:
                split_task = llm.split_direct_vs_deps(
                    pkg_analysis, len(dep_names), 0
                )
                rank_task = llm.rank_dependency_importance(
                    pkg_analysis, dep_names, {}
                )
                (direct_frac, deps_frac), dep_importance = await asyncio.gather(
                    split_task, rank_task
                )
            else:
                direct_frac, deps_frac = 1.0, 0.0
                dep_importance = {}
        else:
            logger.info(
                "[PKGGRAPH] Phase 2: heuristic analysis (LLM skipped) for %s",
                package_name,
            )
            pkg_analysis = {
                "purpose": pkg_info.description or "Unknown package",
                "tech_stack": pkg_info.keywords[:5],
                "project_type": "library",
            }
            direct_frac = 1.0 if not dep_names else 0.6
            deps_frac = 0.0 if not dep_names else 0.4
            dep_importance = self._heuristic_dep_ranking(prod_deps)

        self.nodes[self._node_index(node_id)].metadata = {
            "purpose": pkg_analysis.get("purpose", ""),
            "tech_stack": pkg_analysis.get("tech_stack", []),
            "version": pkg_info.latest_version,
            "ecosystem": ecosystem,
            "github_url": github_url,
        }

        norm = self._norm(package_name, ecosystem)
        direct_code_id = "bow:direct_code:{}:{}".format(ecosystem, norm)
        self.nodes.append(
            Node(
                id=direct_code_id,
                type=NodeType.BODY_OF_WORK,
                label="Direct Code",
            )
        )
        self.edges.append(
            Edge(
                source=node_id,
                target=direct_code_id,
                weight=round(direct_frac, 4),
                label="{}%".format(round(direct_frac * 100, 1)),
            )
        )

        if github_url:
            try:
                owner, repo = parse_repo_owner_and_name(github_url)
                await self._add_contributor_leaves(owner, repo, direct_code_id)
            except Exception as exc:
                logger.warning(
                    "[PKGGRAPH] Contributors failed for %s: %s", package_name, exc
                )

        if dep_names and deps_frac > 0:
            logger.info(
                "[PKGGRAPH] Phase 3: adding dependency children "
                "(budget=%.1f%%, %d candidates)",
                deps_frac * 100,
                len(prod_deps),
            )
            await self._add_dependency_children(
                node_id, ecosystem, prod_deps, dep_importance, deps_frac, depth
            )

    # ------------------------------------------------------------------
    # Lightweight analysis (dependencies at depth > 0): registry only
    # ------------------------------------------------------------------

    async def _build_lightweight(
        self,
        package_name: str,
        ecosystem: str,
        node_id: str,
        depth: int,
    ) -> None:
        """Lightweight path for dependencies: registry metadata + contributors."""
        norm = self._norm(package_name, ecosystem)
        direct_code_id = "bow:direct_code:{}:{}".format(ecosystem, norm)
        self.nodes.append(
            Node(
                id=direct_code_id,
                type=NodeType.BODY_OF_WORK,
                label="Direct Code",
            )
        )

        pkg_info: Optional[PackageInfo] = None
        try:
            pkg_info = await fetch_package_info(package_name, ecosystem)
            self.nodes[self._node_index(node_id)].metadata = {
                "purpose": pkg_info.description or "",
                "version": pkg_info.latest_version,
                "ecosystem": ecosystem,
            }
        except Exception:
            pass

        if depth > 1 and pkg_info:
            prod_deps = [d for d in pkg_info.dependencies if not d.dev_only]
            if prod_deps:
                logger.info(
                    "[PKGGRAPH] %s:%s found %d prod deps",
                    ecosystem,
                    package_name,
                    len(prod_deps),
                )
                dep_importance = self._heuristic_dep_ranking(prod_deps)
                self.edges.append(
                    Edge(
                        source=node_id,
                        target=direct_code_id,
                        weight=0.6,
                        label="60%",
                    )
                )
                await self._add_dependency_children(
                    node_id, ecosystem, prod_deps, dep_importance, 0.4, depth
                )
                await self._add_contributors_for_package(
                    package_name, ecosystem, pkg_info, direct_code_id
                )
                return

        self.edges.append(
            Edge(source=node_id, target=direct_code_id, weight=1.0, label="100%")
        )
        await self._add_contributors_for_package(
            package_name, ecosystem, pkg_info, direct_code_id
        )

    async def _add_contributors_for_package(
        self,
        package_name: str,
        ecosystem: str,
        pkg_info: Optional[PackageInfo],
        parent_id: str,
    ) -> None:
        """Resolve a package to GitHub and add contributor leaves."""
        github_url = (pkg_info.github_url if pkg_info else None)
        if not github_url:
            github_url = await self._resolve_github_safe(package_name, ecosystem)
        if github_url:
            try:
                owner, repo = parse_repo_owner_and_name(github_url)
                await self._add_contributor_leaves(owner, repo, parent_id)
            except Exception:
                pass

    # ------------------------------------------------------------------
    # Add dependency child nodes
    # ------------------------------------------------------------------

    async def _add_dependency_children(
        self,
        parent_id: str,
        ecosystem: str,
        deps: List[Dependency],
        dep_importance: Dict[str, float],
        budget: float,
        depth: int,
    ) -> None:
        """Add the top-N dependency nodes as children of parent_id."""
        ranked = sorted(
            deps,
            key=lambda d: dep_importance.get(d.name, 0.0),
            reverse=True,
        )
        top = ranked[: self.max_children - 1]

        total_raw = sum(dep_importance.get(d.name, 0.01) for d in top)
        if total_raw <= 0:
            total_raw = 1.0

        dev_mult = settings.graph.dev_dep_weight_multiplier

        dep_weights: List[Tuple[Dependency, float]] = []
        for dep in top:
            raw = dep_importance.get(dep.name, 0.01)
            if dep.dev_only:
                raw *= dev_mult
            weight = round((raw / total_raw) * budget, 4)
            if weight >= 0.001:
                dep_weights.append((dep, weight))

        build_tasks = []
        for dep, weight in dep_weights:
            build_tasks.append(
                self._process_single_dep(parent_id, dep, weight, ecosystem, depth)
            )

        if build_tasks:
            logger.info(
                "[PKGGRAPH] Building %d dependency nodes in parallel ...",
                len(build_tasks),
            )
            await asyncio.gather(*build_tasks)

    async def _process_single_dep(
        self,
        parent_id: str,
        dep: Dependency,
        weight: float,
        ecosystem: str,
        depth: int,
    ) -> None:
        """Process a single dependency: recurse or create leaf with contributors."""
        norm = self._norm(dep.name, ecosystem)

        if depth > 1:
            try:
                target_id = "bow:{}:{}".format(ecosystem, norm)
                self.edges.append(
                    Edge(
                        source=parent_id,
                        target=target_id,
                        weight=weight,
                        label="{}%".format(round(weight * 100, 1)),
                    )
                )
                await self._build_node(dep.name, ecosystem, depth - 1, parent_id)
            except Exception as exc:
                logger.warning("Failed to recurse into %s: %s", dep.name, exc)
                dep_node_id = self._add_leaf_dep(
                    parent_id, dep.name, weight, ecosystem
                )
                github_url = await self._resolve_github_safe(dep.name, ecosystem)
                if github_url:
                    try:
                        owner, repo = parse_repo_owner_and_name(github_url)
                        await self._add_contributor_leaves(owner, repo, dep_node_id)
                    except Exception:
                        pass
        else:
            dep_node_id = self._add_leaf_dep(
                parent_id, dep.name, weight, ecosystem
            )
            github_url = await self._resolve_github_safe(dep.name, ecosystem)
            if github_url:
                try:
                    owner, repo = parse_repo_owner_and_name(github_url)
                    await self._add_contributor_leaves(owner, repo, dep_node_id)
                except Exception:
                    pass

    def _add_leaf_dep(
        self,
        parent_id: str,
        dep_name: str,
        weight: float,
        ecosystem: str,
    ) -> str:
        """Add a leaf BODY_OF_WORK node for a dependency."""
        norm = self._norm(dep_name, ecosystem)
        dep_node_id = "bow:{}:{}".format(ecosystem, norm)
        counter = 0
        original = dep_node_id
        while any(n.id == dep_node_id for n in self.nodes):
            counter += 1
            dep_node_id = "{}:{}".format(original, counter)

        self.nodes.append(
            Node(
                id=dep_node_id,
                type=NodeType.BODY_OF_WORK,
                label=dep_name,
            )
        )
        self.edges.append(
            Edge(
                source=parent_id,
                target=dep_node_id,
                weight=weight,
                label="{}%".format(round(weight * 100, 1)),
            )
        )
        return dep_node_id

    # ------------------------------------------------------------------
    # GitHub resolution helper
    # ------------------------------------------------------------------

    async def _resolve_github_safe(
        self, package_name: str, ecosystem: str
    ) -> Optional[str]:
        """Best-effort GitHub URL resolution. Returns None on failure."""
        try:
            return await resolve_to_github_url(package_name, ecosystem)
        except Exception:
            return None

    # ------------------------------------------------------------------
    # Post-processing: enforce CONTRIBUTOR-only leaves
    # ------------------------------------------------------------------

    async def _ensure_contributor_leaves(self) -> None:
        """Find all BOW leaf nodes and ensure they have CONTRIBUTOR children.

        Any BOW leaf that can't get contributors is pruned and its weight
        redistributed to siblings via _normalize_edge_weights.
        """
        has_outgoing = {e.source for e in self.edges}
        bow_leaves = [
            n
            for n in self.nodes
            if n.type == NodeType.BODY_OF_WORK and n.id not in has_outgoing
        ]

        if not bow_leaves:
            return

        logger.info(
            "[PKGGRAPH] Post-processing: %d BOW leaf nodes need contributors",
            len(bow_leaves),
        )

        tasks = []
        for node in bow_leaves:
            eco_pkg = self._extract_eco_pkg_from_id(node.id)
            if eco_pkg:
                tasks.append(
                    self._try_add_contributors_by_package(
                        eco_pkg[0], eco_pkg[1], node.id
                    )
                )

        if tasks:
            await asyncio.gather(*tasks)

        has_outgoing = {e.source for e in self.edges}
        still_leaves = [
            n
            for n in self.nodes
            if n.type == NodeType.BODY_OF_WORK and n.id not in has_outgoing
        ]

        for node in still_leaves:
            logger.info("[PKGGRAPH] Pruning childless BOW node: %s", node.id)
            self.nodes = [n for n in self.nodes if n.id != node.id]
            self.edges = [
                e for e in self.edges if e.source != node.id and e.target != node.id
            ]

        self._normalize_edge_weights()

    async def _try_add_contributors_by_package(
        self, ecosystem: str, package_name: str, node_id: str
    ) -> None:
        """Resolve a package to GitHub and add contributors. Failures silenced."""
        try:
            github_url = None
            try:
                pkg_info = await fetch_package_info(package_name, ecosystem)
                github_url = pkg_info.github_url
            except Exception:
                pass
            if not github_url:
                github_url = await resolve_to_github_url(package_name, ecosystem)
            if github_url:
                owner, repo = parse_repo_owner_and_name(github_url)
                await self._add_contributor_leaves(owner, repo, node_id)
        except Exception:
            pass

    @staticmethod
    def _extract_eco_pkg_from_id(node_id: str) -> Optional[Tuple[str, str]]:
        """Extract (ecosystem, package_name) from a BOW node id.

        Handles formats like:
          bow:npm:express
          bow:direct_code:pypi:flask
          bow:npm:@babel/core:1  (with collision counter)
        """
        if not node_id.startswith("bow:"):
            return None
        rest = node_id[4:]
        if rest.startswith("direct_code:"):
            rest = rest[len("direct_code:"):]

        for eco in ("npm", "pypi"):
            prefix = eco + ":"
            if rest.startswith(prefix):
                pkg = rest[len(prefix):]
                parts = pkg.rsplit(":", 1)
                if len(parts) == 2 and parts[1].isdigit():
                    pkg = parts[0]
                return (eco, pkg) if pkg else None

        return None

    def _normalize_edge_weights(self) -> None:
        """Re-normalize outgoing edge weights from each parent so they sum to 1.0."""
        from collections import defaultdict

        parent_edges: Dict[str, List[int]] = defaultdict(list)
        for i, e in enumerate(self.edges):
            parent_edges[e.source].append(i)

        for parent_id, edge_indices in parent_edges.items():
            parent_node = next((n for n in self.nodes if n.id == parent_id), None)
            if not parent_node or parent_node.type == NodeType.CONTRIBUTOR:
                continue
            total = sum(self.edges[i].weight for i in edge_indices)
            if total <= 0 or abs(total - 1.0) < 0.001:
                continue
            logger.info(
                "[PKGGRAPH] Normalizing edges from %s (was %.4f, now 1.0)",
                parent_id,
                total,
            )
            for i in edge_indices:
                new_w = round(self.edges[i].weight / total, 4)
                self.edges[i] = Edge(
                    source=self.edges[i].source,
                    target=self.edges[i].target,
                    weight=new_w,
                    label="{}%".format(round(new_w * 100, 1)),
                )

    # ------------------------------------------------------------------
    # Compute per-user attribution (path-product walk)
    # ------------------------------------------------------------------

    def compute_user_attribution(self) -> Dict[str, float]:
        """Walk all root -> CONTRIBUTOR paths, multiply edge weights, sum per user.

        Returns a dict of {username: total_credit} sorted descending.
        """
        from collections import defaultdict as _dd

        children: Dict[str, List[Tuple[str, float]]] = _dd(list)
        for e in self.edges:
            children[e.source].append((e.target, e.weight))

        root = next(
            (n.id for n in self.nodes if n.type == NodeType.PACKAGE), None
        )
        if not root:
            return {}

        attribution: Dict[str, float] = _dd(float)
        stack: List[Tuple[str, float]] = [(root, 1.0)]

        while stack:
            node_id, cum_weight = stack.pop()
            node = next((n for n in self.nodes if n.id == node_id), None)
            if not node:
                continue

            if node.type == NodeType.CONTRIBUTOR:
                attribution[node.label] += cum_weight
            else:
                for child_id, edge_weight in children.get(node_id, []):
                    stack.append((child_id, cum_weight * edge_weight))

        sorted_attr = dict(sorted(attribution.items(), key=lambda x: -x[1]))
        return {k: round(v, 6) for k, v in sorted_attr.items()}

    # ------------------------------------------------------------------
    # Add contributor leaf nodes
    # ------------------------------------------------------------------

    async def _add_contributor_leaves(
        self,
        owner: str,
        repo: str,
        parent_id: str,
    ) -> None:
        """Fetch contributor stats and add CONTRIBUTOR leaf nodes."""
        try:
            stats = await fetch_contributor_stats(owner, repo)
        except Exception:
            stats = []

        if not stats:
            logger.info("[PKGGRAPH] No contributor stats available for %s", parent_id)
            return

        top = stats[: self.max_children]
        scores = self._score_contributors(top)
        total = sum(scores.values())
        if total <= 0:
            return

        logger.info(
            "[PKGGRAPH] Adding %d contributors to %s", len(scores), parent_id
        )
        for login, raw_score in scores.items():
            weight = round(raw_score / total, 4)
            if weight < 0.001:
                continue

            user_node_id = "user:{}:{}".format(login, parent_id)
            avatar = ""
            for s in top:
                if s["login"] == login:
                    avatar = s.get("avatar_url", "")
                    break

            self.nodes.append(
                Node(
                    id=user_node_id,
                    type=NodeType.CONTRIBUTOR,
                    label=login,
                    metadata={"avatar_url": avatar},
                )
            )
            self.edges.append(
                Edge(
                    source=parent_id,
                    target=user_node_id,
                    weight=weight,
                    label="{}%".format(round(weight * 100, 1)),
                )
            )

    # ------------------------------------------------------------------
    # Scoring helpers
    # ------------------------------------------------------------------

    def _score_contributors(self, stats: List[Dict[str, Any]]) -> Dict[str, float]:
        """Compute weighted contributor scores from detailed stats."""
        cfg = settings.graph
        if not stats:
            return {}

        max_lines = max(s.get("total_lines", 1) for s in stats) or 1
        max_commits = max(s.get("total_commits", 1) for s in stats) or 1

        scores: Dict[str, float] = {}
        for s in stats:
            norm_lines = s.get("total_lines", 0) / max_lines
            norm_commits = s.get("total_commits", 0) / max_commits
            score = (
                cfg.contributor_lines_weight * norm_lines
                + cfg.contributor_commits_weight * norm_commits
                + cfg.contributor_files_weight * min(norm_lines, norm_commits)
            )
            scores[s["login"]] = score

        return scores

    @staticmethod
    def _heuristic_dep_ranking(deps: List[Dependency]) -> Dict[str, float]:
        """Rank dependencies equally (no usage frequency data available)."""
        if not deps:
            return {}
        equal = 1.0 / len(deps)
        return {d.name: equal for d in deps}

    def _node_index(self, node_id: str) -> int:
        """Find the index of a node by id."""
        for i, n in enumerate(self.nodes):
            if n.id == node_id:
                return i
        return -1


# ------------------------------------------------------------------
# Public API
# ------------------------------------------------------------------


async def build_package_graph(
    package_name: str,
    ecosystem: str,
    max_depth: Optional[int] = None,
    max_children: Optional[int] = None,
) -> Tuple[Graph, GraphConfig, Dict[str, float]]:
    """Build a full contribution attribution graph for a package.

    Returns (graph, config, user_attribution) where user_attribution maps
    each contributor username to their total credit (path-product sum).
    """
    depth = max_depth if max_depth is not None else settings.graph.max_depth
    children = max_children if max_children is not None else settings.graph.max_children

    builder = PackageGraphBuilder(
        max_depth=depth,
        max_children=children,
        decay=settings.graph.decay,
    )
    graph = await builder.build(package_name, ecosystem)
    attribution = builder.compute_user_attribution()
    config = GraphConfig(max_depth=depth, max_children=children)
    return graph, config, attribution
