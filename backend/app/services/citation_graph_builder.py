"""Recursive citation graph builder.

Mirrors the structure of graph_builder.py: collects data (arXiv API, LaTeX
source, Semantic Scholar), runs influence analysis (Gemini with web search
grounding), and assembles a weighted citation attribution graph.
"""

import asyncio
import logging
import shutil
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
from app.services.arxiv import download_paper_source, fetch_paper_metadata, parse_arxiv_id
from app.services.parsers.citations import Citation, build_citations, scan_source_dir
from app.services.semantic_scholar import (
    extract_arxiv_id,
    fetch_paper_by_arxiv_id,
    fetch_paper_references,
    resolve_title_to_arxiv_id,
)

logger = logging.getLogger(__name__)


class CitationGraphBuilder:
    """Builds a citation influence graph recursively."""

    def __init__(
        self,
        max_depth: int,
        max_citations: int,
    ):
        self.max_depth = max_depth
        self.max_citations = max_citations
        self.nodes: List[CitationNode] = []
        self.edges: List[CitationEdge] = []
        self._visited: Set[str] = set()
        self._root_title: str = ""

    async def build(self, arxiv_id: str) -> CitationGraph:
        """Build the full citation graph starting from an arXiv ID."""
        bare_id = parse_arxiv_id(arxiv_id)
        logger.info(
            "========== Building citation graph for %s (depth=%d, citations=%d) ==========",
            bare_id, self.max_depth, self.max_citations,
        )
        await self._build_paper_node(bare_id, depth=self.max_depth, parent_id=None)

        logger.info(
            "========== Citation graph complete: %d nodes, %d edges ==========",
            len(self.nodes), len(self.edges),
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
            await self._add_author_leaves(bare_id, node_id)

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
        metadata = await fetch_paper_metadata(arxiv_id)
        self._root_title = metadata.get("title", "")

        self.nodes[self._node_index(node_id)].metadata = {
            "title": metadata.get("title", ""),
            "abstract": metadata.get("abstract", "")[:300],
            "authors": [a["name"] for a in metadata.get("authors", [])],
            "categories": metadata.get("categories", []),
            "published": metadata.get("published", ""),
            "arxiv_url": metadata.get("arxiv_url", ""),
        }
        self.nodes[self._node_index(node_id)].label = metadata.get("title", arxiv_id)

        await self._add_author_leaves(arxiv_id, node_id, metadata=metadata)

        source_dir: Optional[str] = None
        citations: List[Citation] = []
        try:
            source_dir = await download_paper_source(arxiv_id)
            if source_dir:
                logger.info("[CIT] Phase 1: parsing LaTeX source for %s", arxiv_id)
                bib_entries, cite_freq, cite_contexts = scan_source_dir(source_dir)
                citations = build_citations(bib_entries, cite_freq, cite_contexts)
                logger.info(
                    "[CIT] Phase 1 done: %d bib entries, %d cited keys, %d citations merged",
                    len(bib_entries), len(cite_freq), len(citations),
                )
        finally:
            if source_dir:
                shutil.rmtree(source_dir, ignore_errors=True)

        if not citations:
            logger.info("[CIT] No LaTeX citations found, falling back to Semantic Scholar")
            citations = await self._citations_from_s2(arxiv_id)

        if not citations:
            logger.info("[CIT] No citations found for %s", arxiv_id)
            return

        logger.info("[CIT] Phase 2: LLM influence ranking for %d citations", len(citations))
        citation_dicts = [
            {
                "key": c.key,
                "title": c.title,
                "authors": c.authors,
                "year": c.year,
                "frequency": c.frequency,
                "contexts": c.contexts,
            }
            for c in citations[:30]
        ]

        influence_scores = await llm.rank_citation_influence(
            paper_title=metadata.get("title", ""),
            paper_abstract=metadata.get("abstract", ""),
            categories=metadata.get("categories", []),
            citations=citation_dicts,
        )

        logger.info("[CIT] Phase 3: adding top citation children")
        await self._add_citation_children(
            node_id, citations, influence_scores, depth,
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
        metadata = await fetch_paper_metadata(arxiv_id)

        self.nodes[self._node_index(node_id)].metadata = {
            "title": metadata.get("title", ""),
            "abstract": metadata.get("abstract", "")[:200],
            "authors": [a["name"] for a in metadata.get("authors", [])],
            "categories": metadata.get("categories", []),
            "arxiv_url": metadata.get("arxiv_url", ""),
        }
        self.nodes[self._node_index(node_id)].label = metadata.get("title", arxiv_id)

        await self._add_author_leaves(arxiv_id, node_id, metadata=metadata)

        if depth <= 1:
            return

        citations = await self._citations_from_s2(arxiv_id)
        if not citations:
            return

        citation_dicts = [
            {
                "key": c.key,
                "title": c.title,
                "authors": c.authors,
                "year": c.year,
                "frequency": c.frequency,
                "contexts": c.contexts,
            }
            for c in citations[:20]
        ]

        influence_scores = await llm.rank_citation_influence(
            paper_title=metadata.get("title", ""),
            paper_abstract=metadata.get("abstract", ""),
            categories=metadata.get("categories", []),
            citations=citation_dicts,
        )

        await self._add_citation_children(
            node_id, citations, influence_scores, depth,
        )

    # ------------------------------------------------------------------
    # Build Citation objects from Semantic Scholar references
    # ------------------------------------------------------------------

    async def _citations_from_s2(self, arxiv_id: str) -> List[Citation]:
        """Fetch references from Semantic Scholar and convert to Citation objects."""
        refs = await fetch_paper_references(arxiv_id)
        citations: List[Citation] = []
        for ref in refs:
            key = ref.get("arxiv_id") or ref.get("s2_id") or ref.get("title", "")[:30]
            citations.append(Citation(
                key=str(key),
                title=ref.get("title", ""),
                authors=ref.get("authors", []),
                year=str(ref.get("year", "")),
                frequency=1,
                contexts=[ref.get("abstract", "")[:300]] if ref.get("abstract") else [],
            ))
        return citations

    # ------------------------------------------------------------------
    # Add top-N citation children
    # ------------------------------------------------------------------

    async def _add_citation_children(
        self,
        parent_id: str,
        citations: List[Citation],
        influence_scores: Dict[str, float],
        depth: int,
    ) -> None:
        """Add the top-N most influential citations as children and recurse."""
        ranked = sorted(
            citations,
            key=lambda c: influence_scores.get(c.key, 0.0),
            reverse=True,
        )
        top = ranked[:self.max_citations]

        total_raw = sum(influence_scores.get(c.key, 0.01) for c in top)
        if total_raw <= 0:
            total_raw = 1.0

        weighted: List[Tuple[Citation, float]] = []
        for c in top:
            raw = influence_scores.get(c.key, 0.01)
            weight = round(raw / total_raw, 4)
            if weight >= 0.001:
                weighted.append((c, weight))

        logger.info(
            "[CIT] Resolving %d citation arXiv IDs in parallel ...", len(weighted)
        )
        resolve_tasks = [
            self._resolve_citation_arxiv_id(c) for c, _ in weighted
        ]
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
                from app.services.arxiv import parse_arxiv_id
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
        """Process a single citation: recurse if we have an arXiv ID, else add leaf."""
        if arxiv_id and depth > 1:
            try:
                target_id = "cited:{}".format(arxiv_id)
                self.edges.append(CitationEdge(
                    source=parent_id,
                    target=target_id,
                    weight=weight,
                    label="{}%".format(round(weight * 100, 1)),
                ))
                await self._build_paper_node(arxiv_id, depth - 1, parent_id)
            except Exception as exc:
                logger.warning("[CIT] Failed to recurse into %s: %s", citation.key, exc)
                self._add_leaf_citation(parent_id, citation, weight, arxiv_id)
        else:
            self._add_leaf_citation(parent_id, citation, weight, arxiv_id)

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
        if arxiv_id:
            meta["arxiv_id"] = arxiv_id
            meta["arxiv_url"] = "https://arxiv.org/abs/{}".format(arxiv_id)

        self.nodes.append(CitationNode(
            id=node_id,
            type=CitationNodeType.CITED_WORK,
            label=label,
            metadata=meta,
        ))
        self.edges.append(CitationEdge(
            source=parent_id,
            target=node_id,
            weight=weight,
            label="{}%".format(round(weight * 100, 1)),
        ))
        return node_id

    # ------------------------------------------------------------------
    # Author leaf nodes
    # ------------------------------------------------------------------

    async def _add_author_leaves(
        self,
        arxiv_id: str,
        parent_id: str,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Add AUTHOR leaf nodes for a paper's authors."""
        if metadata is None:
            try:
                metadata = await fetch_paper_metadata(arxiv_id)
            except Exception:
                return

        authors = metadata.get("authors", [])
        if not authors:
            return

        total = len(authors)
        logger.info("[CIT] Adding %d authors to %s", total, parent_id)

        for i, author in enumerate(authors):
            name = author["name"] if isinstance(author, dict) else str(author)
            weight = self._author_weight(i, total)
            if weight < 0.001:
                continue

            author_node_id = "author:{}:{}".format(
                name.replace(" ", "_").lower(), parent_id
            )

            self.nodes.append(CitationNode(
                id=author_node_id,
                type=CitationNodeType.AUTHOR,
                label=name,
                metadata={"position": i + 1, "total_authors": total},
            ))
            self.edges.append(CitationEdge(
                source=parent_id,
                target=author_node_id,
                weight=weight,
                label="{}%".format(round(weight * 100, 1)),
            ))

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
    # Compute per-author attribution (path-product walk)
    # ------------------------------------------------------------------

    def compute_author_attribution(self) -> Dict[str, float]:
        """Walk all root -> AUTHOR paths, multiply edge weights, sum per author.

        Returns {author_name: total_credit} sorted descending.
        """
        from collections import defaultdict

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
    citations = max_citations if max_citations is not None else settings.citation.max_citations

    builder = CitationGraphBuilder(
        max_depth=depth,
        max_citations=citations,
    )
    graph = await builder.build(arxiv_id)
    attribution = builder.compute_author_attribution()
    config = CitationGraphConfig(max_depth=depth, max_citations=citations)
    return graph, config, attribution, builder._root_title
