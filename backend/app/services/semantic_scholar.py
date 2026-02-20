"""Semantic Scholar API client.

Resolves citation titles/keys to arXiv IDs and fetches structured reference
lists for papers without needing LaTeX source.
"""

import logging
from typing import Any, Dict, List, Optional

import httpx

logger = logging.getLogger(__name__)

_TIMEOUT = httpx.Timeout(20.0, connect=10.0)
_BASE = "https://api.semanticscholar.org/graph/v1"

_HEADERS = {"User-Agent": "contribution-tracer/1.0"}

_cache: Dict[str, Optional[Dict[str, Any]]] = {}


async def search_paper(
    title: str,
    authors: Optional[List[str]] = None,
    year: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Search Semantic Scholar for a paper by title (+ optional authors/year).

    Returns dict with: paperId, externalIds, title, authors, year, abstract.
    """
    cache_key = title.lower().strip()[:120]
    if cache_key in _cache:
        logger.info("[S2] Cache hit for '%s'", title[:60])
        return _cache[cache_key]

    query = title
    if authors:
        query = "{} {}".format(title, " ".join(authors[:2]))

    logger.info("[S2] Searching: '%s'", query[:80])
    params = {
        "query": query,
        "limit": "3",
        "fields": "paperId,externalIds,title,authors,year,abstract",
    }

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT, follow_redirects=True) as client:
            resp = await client.get(
                "{}/paper/search".format(_BASE),
                params=params,
                headers=_HEADERS,
            )
            if resp.status_code == 429:
                logger.warning("[S2] Rate limited on search")
                return None
            resp.raise_for_status()

        data = resp.json().get("data", [])
        if not data:
            logger.info("[S2] No results for '%s'", title[:60])
            _cache[cache_key] = None
            return None

        best = data[0]
        logger.info("[S2] Found: '%s' (id=%s)", best.get("title", "")[:60], best.get("paperId", ""))
        _cache[cache_key] = best
        return best

    except Exception as exc:
        logger.warning("[S2] Search failed for '%s': %s", title[:60], exc)
        return None


def extract_arxiv_id(paper: Dict[str, Any]) -> Optional[str]:
    """Extract arXiv ID from a Semantic Scholar paper record."""
    ext = paper.get("externalIds") or {}
    arxiv = ext.get("ArXiv")
    if arxiv:
        return str(arxiv)
    return None


async def resolve_title_to_arxiv_id(
    title: str,
    authors: Optional[List[str]] = None,
    year: Optional[str] = None,
) -> Optional[str]:
    """Search S2 for a paper and return its arXiv ID if available."""
    paper = await search_paper(title, authors, year)
    if not paper:
        return None
    return extract_arxiv_id(paper)


async def fetch_paper_references(
    arxiv_id: str,
    limit: int = 50,
) -> List[Dict[str, Any]]:
    """Fetch structured reference list for a paper via Semantic Scholar.

    Used for the lightweight path (no LaTeX source needed).
    Returns list of dicts with: title, authors, year, arxiv_id, abstract.
    """
    paper_key = "arxiv:{}".format(arxiv_id)
    logger.info("[S2] Fetching references for %s", paper_key)

    params = {
        "fields": "title,authors,year,externalIds,abstract",
        "limit": str(limit),
    }

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT, follow_redirects=True) as client:
            resp = await client.get(
                "{}/paper/{}/references".format(_BASE, paper_key),
                params=params,
                headers=_HEADERS,
            )
            if resp.status_code == 429:
                logger.warning("[S2] Rate limited on references")
                return []
            if resp.status_code == 404:
                logger.info("[S2] Paper not found in S2: %s", paper_key)
                return []
            resp.raise_for_status()

        raw_refs = resp.json().get("data", [])
        refs: List[Dict[str, Any]] = []
        for item in raw_refs:
            cited = item.get("citedPaper")
            if not cited or not cited.get("title"):
                continue

            authors = [a.get("name", "") for a in (cited.get("authors") or [])[:5]]
            ext_ids = cited.get("externalIds") or {}
            refs.append({
                "title": cited["title"],
                "authors": authors,
                "year": cited.get("year"),
                "arxiv_id": ext_ids.get("ArXiv"),
                "doi": ext_ids.get("DOI"),
                "abstract": cited.get("abstract") or "",
                "s2_id": cited.get("paperId"),
            })

        logger.info("[S2] Got %d references for %s", len(refs), paper_key)
        return refs

    except Exception as exc:
        logger.warning("[S2] Failed to fetch references for %s: %s", paper_key, exc)
        return []


async def fetch_paper_by_arxiv_id(arxiv_id: str) -> Optional[Dict[str, Any]]:
    """Fetch a specific paper record by arXiv ID from Semantic Scholar."""
    paper_key = "arxiv:{}".format(arxiv_id)
    logger.info("[S2] Fetching paper %s", paper_key)

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT, follow_redirects=True) as client:
            resp = await client.get(
                "{}/paper/{}".format(_BASE, paper_key),
                params={
                    "fields": (
                        "paperId,externalIds,title,authors,year,publicationDate,"
                        "abstract,citationCount,influentialCitationCount,fieldsOfStudy"
                    )
                },
                headers=_HEADERS,
            )
            if resp.status_code in (404, 429):
                return None
            resp.raise_for_status()

        data = resp.json()
        logger.info("[S2] Paper: '%s' citations=%s influential=%s",
                    data.get("title", "")[:60],
                    data.get("citationCount"),
                    data.get("influentialCitationCount"))
        return data

    except Exception as exc:
        logger.warning("[S2] Failed to fetch paper %s: %s", paper_key, exc)
        return None
