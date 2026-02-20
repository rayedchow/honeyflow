"""Recursive citation graph builder.

Mirrors the structure of graph_builder.py: collects data (arXiv API, LaTeX
source, Semantic Scholar), runs influence analysis (0G Compute Network),
and assembles a weighted citation attribution graph.

Graph structure (mirrors GitHub graph):
  PAPER (root)
  ├── "Original Contribution" (CITED_WORK, weight=original_frac)
  │   └── AUTHOR leaves (the paper's own authors)
  ├── Citation A (CITED_WORK, weight=cited_frac * score_A)
  │   └── AUTHOR leaves (that citation's authors)
  └── Citation B (CITED_WORK, weight=cited_frac * score_B)
      ├── "Original Contribution" → AUTHOR leaves  (if recursed)
      └── Sub-Citation → AUTHOR leaves             (if recursed)

All leaf nodes are AUTHOR type. Outgoing edges from each node sum to 1.0.
"""

import asyncio
import logging
import os
import shutil
from collections import defaultdict
from typing import Any, Dict, List, Optional, Set, Tuple

from app.config import settings
from app.schemas.citation_graph import (
    CitationEdge,
    CitationGraph,
    CitationGraphConfig,
    CitationNode,
    CitationNodeType,
)
from app.services import llm
from app.services.arxiv import (
    download_paper_pdf,
    download_paper_source,
    fetch_paper_metadata,
    parse_arxiv_id,
)
from app.services.parsers.citations import (
    Citation,
    build_citations,
    merge_citation_lists,
    parse_pdf_citations,
    scan_source_dir,
)
from app.services.semantic_scholar import (
    fetch_paper_by_arxiv_id,
    fetch_paper_references,
    resolve_title_to_arxiv_id,
)

logger = logging.getLogger(__name__)


class CitationGraphBuilder:
    """Builds a citation influence graph recursively."""

    def __init__(self, max_depth: int, max_citations: int):
        self.max_depth = max_depth
        self.max_citations = max_citations
        self.nodes: List[CitationNode] = []
        self.edges: List[CitationEdge] = []
        self._visited: Set[str] = set()
        self._root_title: str = ""
        self._metadata_cache: Dict[str, Dict[str, Any]] = {}
        self._metadata_error_cache: Dict[str, str] = {}

    async def build(self, arxiv_id: str) -> CitationGraph:
        """Build the full citation graph starting from an arXiv ID."""
        bare_id = parse_arxiv_id(arxiv_id)
        logger.info(
            "========== Building citation graph for %s (depth=%d, citations=%d) ==========",
            bare_id,
            self.max_depth,
            self.max_citations,
        )
        await self._build_paper_node(bare_id, depth=self.max_depth, parent_id=None)

        await self._ensure_author_leaves()

        logger.info(
            "========== Citation graph complete: %d nodes, %d edges ==========",
            len(self.nodes),
            len(self.edges),
        )
        return CitationGraph(nodes=self.nodes, edges=self.edges)

    # ------------------------------------------------------------------
    # Core recursive builder
    # ------------------------------------------------------------------

    async def _build_paper_node(
        self,
        arxiv_id: str,
        depth: int,
        parent_id: Optional[str],
    ) -> Optional[str]:
        """Build a node for a single paper and recurse into its top citations."""
        bare_id = arxiv_id.split("v")[0]

        if bare_id in self._visited:
            logger.info("[CIT] Skipping %s (already visited)", bare_id)
            return None
        self._visited.add(bare_id)

        is_root = parent_id is None
        node_id = "paper:{}".format(bare_id) if is_root else "cited:{}".format(bare_id)
        node_type = CitationNodeType.PAPER if is_root else CitationNodeType.CITED_WORK

        self.nodes.append(CitationNode(id=node_id, type=node_type, label=bare_id))

        use_source = is_root
        mode = "FULL (LaTeX source + LLM)" if use_source else "LIGHT (S2 API only)"
        logger.info("[CIT] ── %s depth=%d mode=%s", bare_id, depth, mode)

        try:
            if use_source:
                await self._build_with_full_analysis(bare_id, node_id, depth)
            else:
                await self._build_lightweight(bare_id, node_id, depth)
        except Exception as exc:
            logger.warning("[CIT] Analysis failed for %s: %s", bare_id, exc)
            if is_root:
                # Root failure means we cannot build a meaningful graph. Surface
                # this to the API caller rather than returning a single empty node.
                raise
            original_id = self._add_original_contribution(bare_id, node_id, 1.0)
            await self._add_author_leaves(bare_id, original_id)

        return node_id

    # ------------------------------------------------------------------
    # Full analysis (root paper): LaTeX source + LLM influence ranking
    # ------------------------------------------------------------------

    async def _build_with_full_analysis(
        self,
        arxiv_id: str,
        node_id: str,
        depth: int,
    ) -> None:
        """Full analysis: download LaTeX source, parse citations, rank with LLM."""
        metadata = await self._fetch_metadata_with_fallback(arxiv_id)
        self._root_title = metadata.get("title", "")
        self._apply_metadata(node_id, metadata)

        source_dir: Optional[str] = None
        pdf_path: Optional[str] = None
        citations: List[Citation] = []
        pdf_citations: List[Citation] = []
        try:
            source_dir = await download_paper_source(arxiv_id)
            if source_dir:
                logger.info("[CIT] Phase 1: parsing LaTeX source for %s", arxiv_id)
                bib_entries, cite_freq, cite_contexts = scan_source_dir(source_dir)
                citations = build_citations(bib_entries, cite_freq, cite_contexts)
                logger.info(
                    "[CIT] Phase 1 done: %d bib entries, %d cited keys, %d citations merged",
                    len(bib_entries),
                    len(cite_freq),
                    len(citations),
                )
        except Exception as exc:
            logger.warning(
                "[CIT] Source parsing unavailable for %s: %r. Continuing with Semantic Scholar references.",
                arxiv_id,
                exc,
            )
        finally:
            if source_dir:
                shutil.rmtree(source_dir, ignore_errors=True)

        try:
            pdf_path = await download_paper_pdf(arxiv_id)
            if pdf_path:
                logger.info("[CIT] Phase 1b: parsing PDF references for %s", arxiv_id)
                pdf_citations = parse_pdf_citations(pdf_path)
                logger.info(
                    "[CIT] Phase 1b done: %d citations from PDF references/usage",
                    len(pdf_citations),
                )
        except Exception as exc:
            logger.warning(
                "[CIT] PDF parsing unavailable for %s: %r. Continuing.",
                arxiv_id,
                exc,
            )
        finally:
            if pdf_path:
                shutil.rmtree(os.path.dirname(pdf_path), ignore_errors=True)

        if citations and pdf_citations:
            citations = merge_citation_lists(citations, pdf_citations)
            logger.info(
                "[CIT] Combined LaTeX + PDF citations: %d merged entries",
                len(citations),
            )
        elif pdf_citations:
            citations = pdf_citations
            logger.info(
                "[CIT] Using PDF citations as primary source (%d entries)",
                len(citations),
            )

        if not citations:
            logger.info(
                "[CIT] No LaTeX/PDF citations found, falling back to Semantic Scholar"
            )
            citations = await self._citations_from_s2(arxiv_id)

        if not citations:
            logger.info(
                "[CIT] No citations found for %s, 100%% to original contribution",
                arxiv_id,
            )
            original_id = self._add_original_contribution(arxiv_id, node_id, 1.0)
            await self._add_author_leaves(arxiv_id, original_id, metadata=metadata)
            return

        logger.info(
            "[CIT] Phase 2: LLM influence ranking for %d citations", len(citations)
        )
        citation_dicts = self._citation_dicts(citations, limit=30)
        influence_scores = await llm.rank_citation_influence(
            paper_title=metadata.get("title", ""),
            paper_abstract=metadata.get("abstract", ""),
            categories=metadata.get("categories", []),
            citations=citation_dicts,
        )

        original_frac = 0.50
        cited_frac = 0.50

        original_id = self._add_original_contribution(arxiv_id, node_id, original_frac)
        await self._add_author_leaves(arxiv_id, original_id, metadata=metadata)

        logger.info(
            "[CIT] Phase 3: adding top citation children (budget=%.0f%%)",
            cited_frac * 100,
        )
        await self._add_citation_children(
            node_id,
            citations,
            influence_scores,
            depth,
            budget=cited_frac,
        )

    # ------------------------------------------------------------------
    # Lightweight analysis (recursive citations): Semantic Scholar only
    # ------------------------------------------------------------------

    async def _build_lightweight(
        self,
        arxiv_id: str,
        node_id: str,
        depth: int,
    ) -> None:
        """Lightweight path: use Semantic Scholar for metadata and references."""
        metadata = await self._fetch_metadata_with_fallback(arxiv_id)
        self._apply_metadata(node_id, metadata)

        if depth > 1:
            citations = await self._citations_from_s2(arxiv_id)
            if citations:
                citation_dicts = self._citation_dicts(citations, limit=20)
                influence_scores = await llm.rank_citation_influence(
                    paper_title=metadata.get("title", ""),
                    paper_abstract=metadata.get("abstract", ""),
                    categories=metadata.get("categories", []),
                    citations=citation_dicts,
                )

                original_frac = 0.60
                cited_frac = 0.40

                original_id = self._add_original_contribution(
                    arxiv_id, node_id, original_frac
                )
                await self._add_author_leaves(arxiv_id, original_id, metadata=metadata)
                await self._add_citation_children(
                    node_id,
                    citations,
                    influence_scores,
                    depth,
                    budget=cited_frac,
                )
                return

        original_id = self._add_original_contribution(arxiv_id, node_id, 1.0)
        await self._add_author_leaves(arxiv_id, original_id, metadata=metadata)

    # ------------------------------------------------------------------
    # "Original Contribution" intermediate node
    # ------------------------------------------------------------------

    def _add_original_contribution(
        self,
        arxiv_id: str,
        parent_id: str,
        weight: float,
    ) -> str:
        """Add an 'Original Contribution' intermediate CITED_WORK node."""
        original_id = "cited:original:{}".format(arxiv_id)

        counter = 0
        base = original_id
        while any(n.id == original_id for n in self.nodes):
            counter += 1
            original_id = "{}:{}".format(base, counter)

        self.nodes.append(
            CitationNode(
                id=original_id,
                type=CitationNodeType.CITED_WORK,
                label="Original Contribution",
            )
        )
        self.edges.append(
            CitationEdge(
                source=parent_id,
                target=original_id,
                weight=round(weight, 4),
                label="{}%".format(round(weight * 100, 1)),
            )
        )
        return original_id

    # ------------------------------------------------------------------
    # Build Citation objects from Semantic Scholar references
    # ------------------------------------------------------------------

    async def _citations_from_s2(self, arxiv_id: str) -> List[Citation]:
        """Fetch references from Semantic Scholar and convert to Citation objects."""
        refs = await fetch_paper_references(arxiv_id)
        citations: List[Citation] = []
        for ref in refs:
            key = ref.get("arxiv_id") or ref.get("s2_id") or ref.get("title", "")[:30]
            citations.append(
                Citation(
                    key=str(key),
                    title=ref.get("title", ""),
                    authors=ref.get("authors", []),
                    year=str(ref.get("year", "")),
                    frequency=1,
                    contexts=[ref.get("abstract", "")[:300]]
                    if ref.get("abstract")
                    else [],
                )
            )
        return citations

    # ------------------------------------------------------------------
    # Add top-N citation children (with budget)
    # ------------------------------------------------------------------

    async def _add_citation_children(
        self,
        parent_id: str,
        citations: List[Citation],
        influence_scores: Dict[str, float],
        depth: int,
        budget: float = 1.0,
    ) -> None:
        """Add the top-N most influential citations as children and recurse."""
        ranked = sorted(
            citations,
            key=lambda c: influence_scores.get(c.key, 0.0),
            reverse=True,
        )
        top = ranked[: self.max_citations]

        total_raw = sum(influence_scores.get(c.key, 0.01) for c in top)
        if total_raw <= 0:
            total_raw = 1.0

        weighted: List[Tuple[Citation, float]] = []
        for c in top:
            raw = influence_scores.get(c.key, 0.01)
            weight = round((raw / total_raw) * budget, 4)
            if weight >= 0.001:
                weighted.append((c, weight))

        logger.info(
            "[CIT] Resolving %d citation arXiv IDs in parallel ...", len(weighted)
        )
        resolve_tasks = [self._resolve_citation_arxiv_id(c) for c, _ in weighted]
        resolved_ids = await asyncio.gather(*resolve_tasks)

        build_tasks = []
        for (cit, weight), resolved_arxiv_id in zip(weighted, resolved_ids):
            build_tasks.append(
                self._process_single_citation(
                    parent_id, cit, weight, resolved_arxiv_id, depth
                )
            )

        if build_tasks:
            logger.info("[CIT] Building %d citation nodes ...", len(build_tasks))
            await asyncio.gather(*build_tasks)

    async def _resolve_citation_arxiv_id(self, citation: Citation) -> Optional[str]:
        """Try to resolve a citation to an arXiv ID."""
        if citation.key and citation.key.replace(".", "").replace("/", "").isalnum():
            try:
                return parse_arxiv_id(citation.key)
            except ValueError:
                pass

        if citation.title:
            return await resolve_title_to_arxiv_id(
                citation.title,
                authors=citation.authors[:2] if citation.authors else None,
                year=citation.year,
            )
        return None

    async def _process_single_citation(
        self,
        parent_id: str,
        citation: Citation,
        weight: float,
        arxiv_id: Optional[str],
        depth: int,
    ) -> None:
        """Process a single citation: recurse or create leaf with author children."""
        if not arxiv_id and not citation.authors:
            logger.info(
                "[CIT] Skipping citation '%s' (no arXiv ID and no authors)",
                citation.key[:40],
            )
            return

        if arxiv_id and depth > 1:
            try:
                target_id = "cited:{}".format(arxiv_id)
                self.edges.append(
                    CitationEdge(
                        source=parent_id,
                        target=target_id,
                        weight=weight,
                        label="{}%".format(round(weight * 100, 1)),
                    )
                )
                await self._build_paper_node(arxiv_id, depth - 1, parent_id)
            except Exception as exc:
                logger.warning("[CIT] Failed to recurse into %s: %s", citation.key, exc)
                node_id = self._add_leaf_citation(parent_id, citation, weight, arxiv_id)
                await self._add_leaf_authors(node_id, citation, arxiv_id)
        else:
            node_id = self._add_leaf_citation(parent_id, citation, weight, arxiv_id)
            await self._add_leaf_authors(node_id, citation, arxiv_id)

    def _add_leaf_citation(
        self,
        parent_id: str,
        citation: Citation,
        weight: float,
        arxiv_id: Optional[str] = None,
    ) -> str:
        """Add a leaf CITED_WORK node."""
        if arxiv_id:
            node_id = "cited:{}".format(arxiv_id)
        else:
            safe_key = citation.key.replace("/", "_").replace(" ", "_")[:50]
            node_id = "cited:{}".format(safe_key)

        counter = 0
        original = node_id
        while any(n.id == node_id for n in self.nodes):
            counter += 1
            node_id = "{}:{}".format(original, counter)

        label = citation.title if citation.title else citation.key
        meta: Dict[str, Any] = {}
        if citation.title:
            meta["title"] = citation.title
        if citation.authors:
            meta["authors"] = citation.authors[:5]
        if citation.year:
            meta["year"] = citation.year
        if citation.explicit_count > 0:
            meta["explicit_mentions"] = citation.explicit_count
        if citation.conceptual_count > 0:
            meta["conceptual_mentions"] = citation.conceptual_count
        if arxiv_id:
            meta["arxiv_id"] = arxiv_id
            meta["arxiv_url"] = "https://arxiv.org/abs/{}".format(arxiv_id)

        self.nodes.append(
            CitationNode(
                id=node_id,
                type=CitationNodeType.CITED_WORK,
                label=label,
                metadata=meta,
            )
        )
        self.edges.append(
            CitationEdge(
                source=parent_id,
                target=node_id,
                weight=weight,
                label="{}%".format(round(weight * 100, 1)),
            )
        )
        return node_id

    async def _add_leaf_authors(
        self,
        node_id: str,
        citation: Citation,
        arxiv_id: Optional[str],
    ) -> None:
        """Add AUTHOR children to a leaf CITED_WORK node.

        Uses the citation's embedded author list first; falls back to
        fetching from arXiv if the citation has an arXiv ID but no authors.
        """
        if citation.authors:
            self._add_authors_from_list(node_id, citation.authors)
            return

        if arxiv_id:
            await self._add_author_leaves(arxiv_id, node_id)

    # ------------------------------------------------------------------
    # Author leaf nodes
    # ------------------------------------------------------------------

    async def _add_author_leaves(
        self,
        arxiv_id: str,
        parent_id: str,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Add AUTHOR leaf nodes by fetching metadata from arXiv."""
        if metadata is None:
            try:
                metadata = await self._fetch_metadata_with_fallback(arxiv_id)
            except Exception:
                return

        authors = metadata.get("authors", [])
        names = [a["name"] if isinstance(a, dict) else str(a) for a in authors]
        self._add_authors_from_list(parent_id, names)

    def _add_authors_from_list(self, parent_id: str, authors: List[str]) -> None:
        """Add AUTHOR leaf nodes from a plain name list."""
        if not authors:
            return

        total = len(authors)
        logger.info("[CIT] Adding %d authors to %s", total, parent_id)

        for i, name in enumerate(authors):
            if isinstance(name, dict):
                name = name.get("name", str(name))
            name = str(name).strip()
            if not name:
                continue

            weight = self._author_weight(i, total)
            if weight < 0.001:
                continue

            author_node_id = "author:{}:{}".format(
                name.replace(" ", "_").lower(),
                parent_id,
            )
            counter = 0
            base_id = author_node_id
            while any(n.id == author_node_id for n in self.nodes):
                counter += 1
                author_node_id = "{}:{}".format(base_id, counter)

            self.nodes.append(
                CitationNode(
                    id=author_node_id,
                    type=CitationNodeType.AUTHOR,
                    label=name,
                    metadata={"position": i + 1, "total_authors": total},
                )
            )
            self.edges.append(
                CitationEdge(
                    source=parent_id,
                    target=author_node_id,
                    weight=weight,
                    label="{}%".format(round(weight * 100, 1)),
                )
            )

    @staticmethod
    def _author_weight(position: int, total: int) -> float:
        """Compute author weight based on position.

        First author and last author (senior/PI) get the highest weights.
        Middle authors share the remainder.
        """
        if total == 1:
            return 1.0
        if total == 2:
            return 0.6 if position == 0 else 0.4

        first_weight = 0.40
        last_weight = 0.25
        middle_budget = 1.0 - first_weight - last_weight
        middle_count = max(total - 2, 1)
        middle_weight = middle_budget / middle_count

        if position == 0:
            return round(first_weight, 4)
        if position == total - 1:
            return round(last_weight, 4)
        return round(middle_weight, 4)

    # ------------------------------------------------------------------
    # Post-processing: enforce AUTHOR-only leaves
    # ------------------------------------------------------------------

    async def _ensure_author_leaves(self) -> None:
        """Find all CITED_WORK leaf nodes and ensure they have AUTHOR children.

        Any leaf that can't get authors is pruned and its weight redistributed.
        """
        has_outgoing = {e.source for e in self.edges}
        cw_leaves = [
            n
            for n in self.nodes
            if n.type == CitationNodeType.CITED_WORK and n.id not in has_outgoing
        ]

        if not cw_leaves:
            return

        logger.info(
            "[CIT] Post-processing: %d CITED_WORK leaf nodes need authors",
            len(cw_leaves),
        )

        tasks = []
        for node in cw_leaves:
            arxiv_id = self._extract_arxiv_from_id(node.id)
            embedded_authors = (node.metadata or {}).get("authors", [])
            tasks.append(
                self._try_add_leaf_authors(node.id, arxiv_id, embedded_authors)
            )

        await asyncio.gather(*tasks)

        has_outgoing = {e.source for e in self.edges}
        still_leaves = [
            n
            for n in self.nodes
            if n.type == CitationNodeType.CITED_WORK and n.id not in has_outgoing
        ]

        for node in still_leaves:
            logger.info("[CIT] Pruning childless CITED_WORK node: %s", node.id)
            self.nodes = [n for n in self.nodes if n.id != node.id]
            self.edges = [
                e for e in self.edges if e.source != node.id and e.target != node.id
            ]

        self._normalize_edge_weights()

    async def _try_add_leaf_authors(
        self,
        node_id: str,
        arxiv_id: Optional[str],
        embedded_authors: List[str],
    ) -> None:
        """Best-effort author addition for a leaf CITED_WORK."""
        try:
            if embedded_authors:
                self._add_authors_from_list(node_id, embedded_authors)
                return
            if arxiv_id:
                await self._add_author_leaves(arxiv_id, node_id)
        except Exception:
            pass

    @staticmethod
    def _extract_arxiv_from_id(node_id: str) -> Optional[str]:
        """Try to extract an arXiv ID from a CITED_WORK node id like 'cited:2310.06825'."""
        if not node_id.startswith("cited:"):
            return None
        rest = node_id[6:]
        if rest.startswith("original:"):
            rest = rest[9:]
        rest = rest.split(":")[0]
        if rest and any(c.isdigit() for c in rest) and "." in rest:
            return rest
        return None

    def _normalize_edge_weights(self) -> None:
        """Re-normalize outgoing edge weights from each parent so they sum to 1.0."""
        parent_edges: Dict[str, List[int]] = defaultdict(list)
        for i, e in enumerate(self.edges):
            parent_edges[e.source].append(i)

        for parent_id, edge_indices in parent_edges.items():
            parent_node = next((n for n in self.nodes if n.id == parent_id), None)
            if not parent_node or parent_node.type == CitationNodeType.AUTHOR:
                continue
            total = sum(self.edges[i].weight for i in edge_indices)
            if total <= 0 or abs(total - 1.0) < 0.001:
                continue
            logger.info(
                "[CIT] Normalizing edges from %s (was %.4f, now 1.0)", parent_id, total
            )
            for i in edge_indices:
                new_w = round(self.edges[i].weight / total, 4)
                self.edges[i] = CitationEdge(
                    source=self.edges[i].source,
                    target=self.edges[i].target,
                    weight=new_w,
                    label="{}%".format(round(new_w * 100, 1)),
                )

    # ------------------------------------------------------------------
    # Compute per-author attribution (path-product walk)
    # ------------------------------------------------------------------

    def compute_author_attribution(self) -> Dict[str, float]:
        """Walk all root -> AUTHOR paths, multiply edge weights, sum per author.

        Returns {author_name: total_credit} sorted descending.
        """
        children: Dict[str, List[Tuple[str, float]]] = defaultdict(list)
        for e in self.edges:
            children[e.source].append((e.target, e.weight))

        root = next(
            (n.id for n in self.nodes if n.type == CitationNodeType.PAPER), None
        )
        if not root:
            return {}

        attribution: Dict[str, float] = defaultdict(float)
        stack: List[Tuple[str, float]] = [(root, 1.0)]

        while stack:
            node_id, cum_weight = stack.pop()
            node = next((n for n in self.nodes if n.id == node_id), None)
            if not node:
                continue
            if node.type == CitationNodeType.AUTHOR:
                attribution[node.label] += cum_weight
            else:
                for child_id, edge_weight in children.get(node_id, []):
                    stack.append((child_id, cum_weight * edge_weight))

        sorted_attr = dict(sorted(attribution.items(), key=lambda x: -x[1]))
        return {k: round(v, 6) for k, v in sorted_attr.items()}

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _apply_metadata(self, node_id: str, metadata: Dict[str, Any]) -> None:
        """Set metadata and label on a paper node."""
        idx = self._node_index(node_id)
        if idx < 0:
            return
        self.nodes[idx].metadata = {
            "title": metadata.get("title", ""),
            "abstract": metadata.get("abstract", "")[:300],
            "authors": [a["name"] for a in metadata.get("authors", [])],
            "categories": metadata.get("categories", []),
            "published": metadata.get("published", ""),
            "arxiv_url": metadata.get("arxiv_url", ""),
        }
        self.nodes[idx].label = metadata.get("title", self.nodes[idx].label)

    async def _fetch_metadata_with_fallback(self, arxiv_id: str) -> Dict[str, Any]:
        """Fetch metadata for a paper.

        Primary source is Semantic Scholar Graph API (citation-native and less
        brittle for this workflow). arXiv legacy API is a fallback only.
        """
        bare_id = arxiv_id.split("v")[0]
        if bare_id in self._metadata_cache:
            logger.info("[CIT] Metadata cache hit for %s", bare_id)
            return self._metadata_cache[bare_id]
        if bare_id in self._metadata_error_cache:
            raise RuntimeError(
                "Metadata unavailable for {} (cached failure: {})".format(
                    bare_id, self._metadata_error_cache[bare_id]
                )
            )

        try:
            s2 = await fetch_paper_by_arxiv_id(arxiv_id)
            if s2:
                logger.info("[CIT] Metadata source for %s: Semantic Scholar", bare_id)
                result = self._map_s2_metadata(arxiv_id, s2)
                self._metadata_cache[bare_id] = result
                self._metadata_error_cache.pop(bare_id, None)
                return result

            logger.info(
                "[CIT] Semantic Scholar metadata not available for %s, trying arXiv legacy API fallback",
                bare_id,
            )
            result = await fetch_paper_metadata(arxiv_id)
            logger.info(
                "[CIT] Metadata source for %s: arXiv legacy API (fallback)", bare_id
            )
            self._metadata_cache[bare_id] = result
            self._metadata_error_cache.pop(bare_id, None)
            return result
        except Exception as exc:
            msg = "Could not fetch metadata for {} (S2 unavailable, arXiv fallback failed: {!r})".format(
                arxiv_id, exc
            )
            self._metadata_error_cache[bare_id] = msg
            raise RuntimeError(
                "Could not fetch metadata for {} (S2 unavailable, arXiv fallback failed: {!r})".format(
                    arxiv_id, exc
                )
            )

    @staticmethod
    def _map_s2_metadata(arxiv_id: str, s2: Dict[str, Any]) -> Dict[str, Any]:
        """Map a Semantic Scholar paper record to our arXiv metadata shape."""
        authors = [
            {"name": a.get("name", "")}
            for a in (s2.get("authors") or [])
            if a.get("name")
        ]
        year = s2.get("year")
        published = s2.get("publicationDate") or (
            "{}-01-01".format(year) if year else ""
        )
        categories = [x for x in (s2.get("fieldsOfStudy") or []) if isinstance(x, str)]
        bare_id = arxiv_id.split("v")[0]
        return {
            "arxiv_id": bare_id,
            "arxiv_url": "https://arxiv.org/abs/{}".format(bare_id),
            "title": s2.get("title", ""),
            "abstract": s2.get("abstract", "") or "",
            "authors": authors,
            "categories": categories,
            "published": published,
            "doi": "",
        }

    @staticmethod
    def _citation_dicts(
        citations: List[Citation], limit: int = 30
    ) -> List[Dict[str, Any]]:
        return [
            {
                "key": c.key,
                "title": c.title,
                "authors": c.authors,
                "year": c.year,
                "frequency": c.frequency,
                "explicit_count": c.explicit_count,
                "conceptual_count": c.conceptual_count,
                "contexts": c.contexts,
            }
            for c in citations[:limit]
        ]

    def _node_index(self, node_id: str) -> int:
        for i, n in enumerate(self.nodes):
            if n.id == node_id:
                return i
        return -1


# ------------------------------------------------------------------
# Public API
# ------------------------------------------------------------------


async def build_citation_graph(
    arxiv_id: str,
    max_depth: Optional[int] = None,
    max_citations: Optional[int] = None,
) -> Tuple[CitationGraph, CitationGraphConfig, Dict[str, float], str]:
    """Build a full citation attribution graph for a paper.

    Returns (graph, config, author_attribution, paper_title).
    """
    depth = max_depth if max_depth is not None else settings.citation.max_depth
    citations = (
        max_citations if max_citations is not None else settings.citation.max_citations
    )

    builder = CitationGraphBuilder(
        max_depth=depth,
        max_citations=citations,
    )
    graph = await builder.build(arxiv_id)
    attribution = builder.compute_author_attribution()
    config = CitationGraphConfig(max_depth=depth, max_citations=citations)
    return graph, config, attribution, builder._root_title
