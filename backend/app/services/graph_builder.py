"""Recursive graph builder that orchestrates the full contribution tracing pipeline.

Collects data (GitHub API, tarball, parsers), runs analysis (LLM + heuristic),
and assembles a weighted attribution graph.
"""

import asyncio
import logging
import os
import shutil
from typing import Any, Dict, List, Optional, Set, Tuple

from app.config import settings
from app.schemas.graph import Edge, Graph, GraphConfig, Node, NodeType
from app.services import llm
from app.services.github import (
    build_file_tree,
    download_repo_tarball,
    fetch_contributor_stats,
    fetch_readme,
    fetch_repo_metadata,
    parse_repo_owner_and_name,
)
from app.services.parsers.imports import count_import_frequency
from app.services.parsers.manifest import Dependency, parse_all_manifests
from app.services.registry import resolve_to_github_url

logger = logging.getLogger(__name__)


class GraphBuilder:
    """Builds a contribution attribution graph recursively."""

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
        self._human_priors: Dict[str, Any] = {}

    async def build(self, repo_url: str) -> Graph:
        """Build the full graph starting from a repo URL."""
        from app.services.jury_priors import load_priors
        try:
            self._human_priors = await load_priors()
        except Exception:
            self._human_priors = {}

        owner, repo = parse_repo_owner_and_name(repo_url)
        logger.info(
            "========== Building graph for %s/%s (depth=%d, children=%d) ==========",
            owner,
            repo,
            self.max_depth,
            self.max_children,
        )
        await self._build_node(owner, repo, depth=self.max_depth, parent_id=None)

        await self._ensure_contributor_leaves()

        logger.info(
            "========== Graph complete: %d nodes, %d edges ==========",
            len(self.nodes),
            len(self.edges),
        )
        return Graph(nodes=self.nodes, edges=self.edges)

    # ------------------------------------------------------------------
    # Core recursive builder
    # ------------------------------------------------------------------

    async def _build_node(
        self,
        owner: str,
        repo: str,
        depth: int,
        parent_id: Optional[str],
    ) -> Optional[str]:
        """Build a single repo node and its children. Returns the node id."""
        repo_key = "{}/{}".format(owner, repo)

        if repo_key in self._visited:
            logger.info("[GRAPH] Skipping %s (already visited)", repo_key)
            return None
        self._visited.add(repo_key)

        is_root = parent_id is None
        node_id = "repo:{}".format(repo_key) if is_root else "bow:{}".format(repo_key)

        node_type = NodeType.REPO if is_root else NodeType.BODY_OF_WORK
        self.nodes.append(Node(id=node_id, type=node_type, label=repo_key))

        use_tarball = is_root
        use_llm = is_root
        mode = (
            "FULL (tarball+LLM)"
            if use_tarball and use_llm
            else ("FULL (tarball)" if use_tarball else "LIGHT (API only)")
        )
        logger.info("[GRAPH] ── %s depth=%d mode=%s", repo_key, depth, mode)

        source_dir: Optional[str] = None
        try:
            if use_tarball:
                source_dir = await self._build_with_full_analysis(
                    owner, repo, node_id, depth, use_llm
                )
            else:
                await self._build_lightweight(owner, repo, node_id, depth)
        except Exception as exc:
            logger.warning(
                "Analysis failed for %s: [%s] %s",
                repo_key, type(exc).__name__, exc, exc_info=True,
            )
            await self._add_contributor_leaves(owner, repo, node_id)
        finally:
            if source_dir:
                shutil.rmtree(os.path.dirname(source_dir), ignore_errors=True)

        return node_id

    # ------------------------------------------------------------------
    # Full analysis (root repo): tarball + LLM + parsers
    # ------------------------------------------------------------------

    async def _build_with_full_analysis(
        self,
        owner: str,
        repo: str,
        node_id: str,
        depth: int,
        use_llm: bool,
    ) -> Optional[str]:
        """Full analysis path: download tarball, parse manifests/imports, use LLM."""
        source_dir = await download_repo_tarball(owner, repo)

        logger.info("[GRAPH] Phase 1: collecting data for %s/%s ...", owner, repo)
        metadata_task = fetch_repo_metadata(owner, repo)
        readme_task = fetch_readme(owner, repo)
        metadata, readme = await asyncio.gather(metadata_task, readme_task)

        file_tree = build_file_tree(source_dir)
        ecosystem, deps = parse_all_manifests(source_dir)
        usage_freq = count_import_frequency(source_dir, ecosystem)

        source_file_count = self._count_source_files(source_dir)
        prod_deps = [d for d in deps if not d.dev_only]

        # If no prod deps but dev deps exist (monorepos, compilers, etc.),
        # treat dev deps as analysis candidates so the LLM still runs.
        if not prod_deps and deps:
            logger.info(
                "[GRAPH] No prod deps found; using %d dev deps for analysis", len(deps)
            )
            prod_deps = deps

        dep_names = [d.name for d in prod_deps]
        logger.info(
            "[GRAPH] Phase 1 done: ecosystem=%s, %d deps (%d analysable), "
            "%d source files, %d import entries",
            ecosystem,
            len(deps),
            len(dep_names),
            source_file_count,
            len(usage_freq),
        )

        if use_llm:
            logger.info(
                "[GRAPH] Phase 2: running LLM analysis for %s/%s ...", owner, repo
            )
            repo_analysis = await llm.analyze_repo(readme, metadata, file_tree)

            if dep_names:
                matched_usage = self._match_usage(deps, usage_freq, ecosystem)
                split_task = llm.split_direct_vs_deps(
                    repo_analysis, len(dep_names), source_file_count
                )
                rank_task = llm.rank_dependency_importance(
                    repo_analysis,
                    dep_names,
                    matched_usage,
                )
                (direct_frac, deps_frac), dep_importance = await asyncio.gather(
                    split_task, rank_task
                )
            else:
                direct_frac, deps_frac = 1.0, 0.0
                dep_importance = {}
                matched_usage = {}
        else:
            logger.info(
                "[GRAPH] Phase 2: heuristic analysis (LLM skipped) for %s/%s",
                owner,
                repo,
            )
            repo_analysis = {
                "purpose": metadata.get("description", ""),
                "tech_stack": list((metadata.get("languages") or {}).keys()),
                "project_type": "application",
            }
            direct_frac = 1.0 if not dep_names else 0.6
            deps_frac = 0.0 if not dep_names else 0.4
            matched_usage = self._match_usage(deps, usage_freq, ecosystem)
            dep_importance = self._heuristic_dep_ranking(
                deps,
                matched_usage,
            )

        self.nodes[self._node_index(node_id)].metadata = {
            "purpose": repo_analysis.get("purpose", ""),
            "tech_stack": repo_analysis.get("tech_stack", []),
        }

        direct_code_id = "bow:direct_code:{}/{}".format(owner, repo)
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

        await self._add_contributor_leaves(owner, repo, direct_code_id)

        if dep_names and deps_frac > 0:
            logger.info(
                "[GRAPH] Phase 3: adding dependency children (budget=%.1f%%, %d candidates)",
                deps_frac * 100,
                len(prod_deps),
            )
            await self._add_dependency_children(
                node_id,
                ecosystem,
                prod_deps,
                dep_importance,
                deps_frac,
                depth,
                usage_map=matched_usage,
            )

        return source_dir

    # ------------------------------------------------------------------
    # Lightweight analysis (dependencies at depth > 0): API only
    # ------------------------------------------------------------------

    async def _build_lightweight(
        self,
        owner: str,
        repo: str,
        node_id: str,
        depth: int,
    ) -> None:
        """Lightweight path for dependencies: contributor stats + API manifest fetch."""
        direct_code_id = "bow:direct_code:{}/{}".format(owner, repo)
        self.nodes.append(
            Node(
                id=direct_code_id,
                type=NodeType.BODY_OF_WORK,
                label="Direct Code",
            )
        )

        metadata = None
        try:
            metadata = await fetch_repo_metadata(owner, repo)
            self.nodes[self._node_index(node_id)].metadata = {
                "purpose": metadata.get("description", ""),
            }
        except Exception:
            pass

        if depth > 1:
            languages = (metadata or {}).get("languages") or {}
            manifest_result = await self._fetch_remote_manifest(owner, repo, languages)
            if manifest_result:
                ecosystem, prod_deps = manifest_result
                if prod_deps:
                    logger.info(
                        "[GRAPH] %s/%s found %d prod deps via %s manifest",
                        owner,
                        repo,
                        len(prod_deps),
                        ecosystem,
                    )
                    dep_importance = self._heuristic_dep_ranking(prod_deps, {})
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
                    await self._add_contributor_leaves(owner, repo, direct_code_id)
                    return

        self.edges.append(
            Edge(source=node_id, target=direct_code_id, weight=1.0, label="100%")
        )
        await self._add_contributor_leaves(owner, repo, direct_code_id)

    # ------------------------------------------------------------------
    # Remote manifest fetch for lightweight path
    # ------------------------------------------------------------------

    _LANG_TO_MANIFESTS = {
        "Python": [("pyproject.toml", "pypi"), ("requirements.txt", "pypi")],
        "JavaScript": [("package.json", "npm")],
        "TypeScript": [("package.json", "npm")],
        "Rust": [("Cargo.toml", "crates")],
        "Go": [("go.mod", "go")],
    }

    _ALL_MANIFESTS = [
        ("package.json", "npm"),
        ("pyproject.toml", "pypi"),
        ("requirements.txt", "pypi"),
        ("Cargo.toml", "crates"),
        ("go.mod", "go"),
    ]

    async def _fetch_remote_manifest(
        self,
        owner: str,
        repo: str,
        languages: Dict,
    ) -> Optional[tuple]:
        """Try to fetch a manifest file via the GitHub Contents API.

        Uses the repo's language breakdown to try the most likely manifest first.
        Returns (ecosystem, prod_deps) or None.
        """
        import tempfile

        from app.services.github import fetch_file_content
        from app.services.parsers.manifest import parse_manifest

        candidates = []
        seen = set()
        for lang in languages:
            for item in self._LANG_TO_MANIFESTS.get(lang, []):
                if item[0] not in seen:
                    candidates.append(item)
                    seen.add(item[0])
        for item in self._ALL_MANIFESTS:
            if item[0] not in seen:
                candidates.append(item)
                seen.add(item[0])

        for filename, ecosystem in candidates:
            text = await fetch_file_content(owner, repo, filename)
            if not text:
                continue

            tmp = tempfile.mkdtemp(prefix="manifest_")
            try:
                fpath = os.path.join(tmp, filename)
                with open(fpath, "w") as f:
                    f.write(text)
                deps = parse_manifest(fpath, ecosystem)
                prod_deps = [d for d in deps if not d.dev_only]
                return (ecosystem, prod_deps)
            except Exception as exc:
                logger.warning(
                    "[GRAPH] Failed to parse %s for %s/%s: %s",
                    filename,
                    owner,
                    repo,
                    exc,
                )
            finally:
                shutil.rmtree(tmp, ignore_errors=True)

        logger.info("[GRAPH] No manifest found for %s/%s", owner, repo)
        return None

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
        usage_map: Optional[Dict[str, int]] = None,
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

        dep_weights: List[Tuple[Dependency, float, Dict[str, Any]]] = []
        for dep in top:
            raw = dep_importance.get(dep.name, 0.01)
            if dep.dev_only:
                raw *= dev_mult
            weight = round((raw / total_raw) * budget, 4)
            if weight >= 0.001:
                dep_weights.append(
                    (
                        dep,
                        weight,
                        {
                            "dependency_name": dep.name,
                            "dependency_version": dep.version,
                            "is_dev_dependency": dep.dev_only,
                            "importance_score": round(
                                dep_importance.get(dep.name, 0.01), 4
                            ),
                            "usage_import_count": (usage_map or {}).get(dep.name, 0),
                        },
                    )
                )

        # Resolve all registry URLs in parallel
        logger.info(
            "[GRAPH] Resolving %d dependency URLs in parallel ...", len(dep_weights)
        )
        resolve_tasks = [
            resolve_to_github_url(d.name, ecosystem) for d, _, _ in dep_weights
        ]
        github_urls = await asyncio.gather(*resolve_tasks)

        # Build all dep nodes in parallel
        build_tasks = []
        for (dep, weight, edge_meta), github_url in zip(dep_weights, github_urls):
            build_tasks.append(
                self._process_single_dep(
                    parent_id,
                    dep,
                    weight,
                    github_url,
                    depth,
                    edge_metadata=edge_meta,
                )
            )

        if build_tasks:
            logger.info(
                "[GRAPH] Building %d dependency nodes in parallel ...", len(build_tasks)
            )
            await asyncio.gather(*build_tasks)

    async def _process_single_dep(
        self,
        parent_id: str,
        dep: Dependency,
        weight: float,
        github_url: Optional[str],
        depth: int,
        edge_metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Process a single dependency: recurse or create leaf with contributors."""
        if not github_url:
            logger.info(
                "[GRAPH] Skipping dep %s (no GitHub URL, cannot trace contributors)",
                dep.name,
            )
            return

        if depth > 1:
            try:
                dep_owner, dep_repo = parse_repo_owner_and_name(github_url)
                target_id = "bow:{}/{}".format(dep_owner, dep_repo)
                if self._would_create_cycle(parent_id, target_id):
                    logger.info(
                        "[GRAPH] Skipping edge %s -> %s (would create cycle)",
                        parent_id,
                        target_id,
                    )
                    return

                self.edges.append(
                    Edge(
                        source=parent_id,
                        target=target_id,
                        weight=weight,
                        label="{}%".format(round(weight * 100, 1)),
                        metadata=edge_metadata or {},
                    )
                )
                await self._build_node(dep_owner, dep_repo, depth - 1, parent_id)
            except Exception as exc:
                logger.warning("Failed to recurse into %s: %s", dep.name, exc)
                dep_node_id = self._add_leaf_dep(
                    parent_id,
                    dep.name,
                    weight,
                    github_url,
                    edge_metadata=edge_metadata,
                )
                try:
                    dep_owner, dep_repo = parse_repo_owner_and_name(github_url)
                    await self._add_contributor_leaves(dep_owner, dep_repo, dep_node_id)
                except Exception:
                    pass
        else:
            dep_node_id = self._add_leaf_dep(
                parent_id,
                dep.name,
                weight,
                github_url,
                edge_metadata=edge_metadata,
            )
            try:
                dep_owner, dep_repo = parse_repo_owner_and_name(github_url)
                await self._add_contributor_leaves(dep_owner, dep_repo, dep_node_id)
            except Exception:
                pass

    def _add_leaf_dep(
        self,
        parent_id: str,
        dep_name: str,
        weight: float,
        github_url: Optional[str] = None,
        edge_metadata: Optional[Dict[str, Any]] = None,
    ) -> str:
        """Add a leaf BODY_OF_WORK node for a dependency."""
        if github_url:
            try:
                owner, repo = parse_repo_owner_and_name(github_url)
                dep_node_id = "bow:{}/{}".format(owner, repo)
            except Exception:
                dep_node_id = "bow:{}".format(dep_name)
        else:
            dep_node_id = "bow:{}".format(dep_name)
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
                metadata=edge_metadata or {},
            )
        )
        return dep_node_id

    def _would_create_cycle(self, source_id: str, target_id: str) -> bool:
        """Return True if adding source_id -> target_id would create a cycle."""
        if source_id == target_id:
            return True

        # If target can already reach source, adding source -> target closes a cycle.
        adjacency: Dict[str, List[str]] = {}
        for e in self.edges:
            adjacency.setdefault(e.source, []).append(e.target)

        stack = [target_id]
        seen = {target_id}
        while stack:
            node = stack.pop()
            if node == source_id:
                return True
            for child in adjacency.get(node, []):
                if child not in seen:
                    seen.add(child)
                    stack.append(child)
        return False

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
            "[GRAPH] Post-processing: %d BOW leaf nodes need contributors",
            len(bow_leaves),
        )

        tasks = []
        for node in bow_leaves:
            owner_repo = self._extract_owner_repo_from_id(node.id)
            if owner_repo:
                tasks.append(
                    self._try_add_contributors(owner_repo[0], owner_repo[1], node.id)
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
            logger.info("[GRAPH] Pruning childless BOW node: %s", node.id)
            self.nodes = [n for n in self.nodes if n.id != node.id]
            self.edges = [
                e for e in self.edges if e.source != node.id and e.target != node.id
            ]

        self._normalize_edge_weights()

    async def _try_add_contributors(self, owner: str, repo: str, node_id: str) -> None:
        """Best-effort contributor fetch for a BOW leaf. Failures are silenced."""
        try:
            await self._add_contributor_leaves(owner, repo, node_id)
        except Exception:
            pass

    @staticmethod
    def _extract_owner_repo_from_id(node_id: str) -> Optional[Tuple[str, str]]:
        """Try to extract (owner, repo) from a BOW node id like 'bow:owner/repo'."""
        if not node_id.startswith("bow:"):
            return None
        rest = node_id[4:]
        if rest.startswith("direct_code:"):
            rest = rest[len("direct_code:") :]
        if "/" not in rest:
            return None
        slash_idx = rest.index("/")
        owner = rest[:slash_idx]
        repo_part = rest[slash_idx + 1 :]
        if ":" in repo_part:
            repo_part = repo_part[: repo_part.index(":")]
        if owner and repo_part:
            return owner, repo_part
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
                "[GRAPH] Normalizing edges from %s (was %.4f, now 1.0)",
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
                    metadata=self.edges[i].metadata,
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

        root = next((n.id for n in self.nodes if n.type == NodeType.REPO), None)
        if not root:
            return {}

        attribution: Dict[str, float] = _dd(float)
        stack: List[Tuple[str, float, Set[str]]] = [(root, 1.0, {root})]
        step_count = 0
        max_steps = 1_000_000

        while stack:
            node_id, cum_weight, path_nodes = stack.pop()
            step_count += 1
            if step_count > max_steps:
                logger.warning(
                    "[GRAPH] Attribution traversal aborted after %d steps (possible cycle explosion)",
                    max_steps,
                )
                break

            node = next((n for n in self.nodes if n.id == node_id), None)
            if not node:
                continue

            if node.type == NodeType.CONTRIBUTOR:
                attribution[node.label] += cum_weight
            else:
                for child_id, edge_weight in children.get(node_id, []):
                    if child_id in path_nodes:
                        logger.warning(
                            "[GRAPH] Cycle detected during attribution: %s -> %s (skipping edge)",
                            node_id,
                            child_id,
                        )
                        continue
                    stack.append(
                        (child_id, cum_weight * edge_weight, path_nodes | {child_id})
                    )

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
            logger.info("[GRAPH] No contributor stats available for %s", parent_id)
            return

        top = stats[: self.max_children]
        scores = self._score_contributors(top)

        from app.services.jury_priors import apply_priors_to_scores
        if self._human_priors:
            scores = apply_priors_to_scores(scores, "contributor", self._human_priors)

        total = sum(scores.values())
        if total <= 0:
            return

        logger.info("[GRAPH] Adding %d contributors to %s", len(scores), parent_id)
        for login, raw_score in scores.items():
            weight = round(raw_score / total, 4)
            if weight < 0.001:
                continue

            user_node_id = "user:{}:{}".format(login, parent_id)
            contrib_stats: Dict[str, Any] = {}
            for s in top:
                if s["login"] == login:
                    contrib_stats = s
                    break
            avatar = contrib_stats.get("avatar_url", "")

            self.nodes.append(
                Node(
                    id=user_node_id,
                    type=NodeType.CONTRIBUTOR,
                    label=login,
                    metadata={
                        "avatar_url": avatar,
                        "total_commits": contrib_stats.get("total_commits", 0),
                        "total_additions": contrib_stats.get("total_additions", 0),
                        "total_deletions": contrib_stats.get("total_deletions", 0),
                        "total_lines": contrib_stats.get("total_lines", 0),
                    },
                )
            )
            self.edges.append(
                Edge(
                    source=parent_id,
                    target=user_node_id,
                    weight=weight,
                    label="{}%".format(round(weight * 100, 1)),
                    metadata={
                        "contributor_login": login,
                        "contributor_score_raw": round(raw_score, 6),
                        "contributor_total_lines": contrib_stats.get("total_lines", 0),
                        "contributor_total_commits": contrib_stats.get(
                            "total_commits", 0
                        ),
                    },
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
    def _heuristic_dep_ranking(
        deps: List[Dependency],
        usage: Dict[str, int],
    ) -> Dict[str, float]:
        """Rank dependencies by usage frequency only (no LLM)."""
        if not usage:
            equal = 1.0 / len(deps) if deps else 0.0
            return {d.name: equal for d in deps}
        max_freq = max(usage.values()) or 1
        return {d.name: max(usage.get(d.name, 0) / max_freq, 0.01) for d in deps}

    @staticmethod
    def _match_usage(
        deps: List[Dependency],
        usage_freq: Dict[str, int],
        ecosystem: str,
    ) -> Dict[str, int]:
        """Match dependency names to import frequency, handling name normalization."""
        matched: Dict[str, int] = {}
        norm_usage = {}
        for key, count in usage_freq.items():
            norm_usage[key.lower().replace("-", "_")] = count
            norm_usage[key.lower()] = count

        for dep in deps:
            name = dep.name
            freq = usage_freq.get(name, 0)
            if freq == 0:
                norm = name.lower().replace("-", "_")
                freq = norm_usage.get(norm, 0)
            matched[name] = freq

        return matched

    @staticmethod
    def _count_source_files(source_dir: str) -> int:
        """Count source files in a directory tree."""
        extensions = (".py", ".js", ".jsx", ".ts", ".tsx", ".rs", ".go", ".java", ".rb")
        skip = {"node_modules", ".git", "__pycache__", "venv", ".venv", "target"}
        count = 0
        for root, dirs, files in os.walk(source_dir):
            dirs[:] = [d for d in dirs if d not in skip]
            count += sum(1 for f in files if f.endswith(extensions))
        return count

    def _node_index(self, node_id: str) -> int:
        """Find the index of a node by id."""
        for i, n in enumerate(self.nodes):
            if n.id == node_id:
                return i
        return -1


# ------------------------------------------------------------------
# Public API
# ------------------------------------------------------------------


async def build_contribution_graph(
    repo_url: str,
    max_depth: Optional[int] = None,
    max_children: Optional[int] = None,
) -> Tuple[Graph, GraphConfig, Dict[str, float]]:
    """Build a full contribution attribution graph for a repo.

    Returns (graph, config, user_attribution) where user_attribution maps
    each contributor username to their total credit (path-product sum).
    """
    depth = max_depth if max_depth is not None else settings.graph.max_depth
    children = max_children if max_children is not None else settings.graph.max_children

    builder = GraphBuilder(
        max_depth=depth,
        max_children=children,
        decay=settings.graph.decay,
    )
    graph = await builder.build(repo_url)
    attribution = builder.compute_user_attribution()
    config = GraphConfig(max_depth=depth, max_children=children)
    return graph, config, attribution
