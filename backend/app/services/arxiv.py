"""arXiv API client.

Handles paper metadata fetching and LaTeX source tarball download/extraction.
"""

import logging
import os
import re
import tarfile
import tempfile
from typing import Any, Dict, List, Optional
from xml.etree import ElementTree

import httpx

logger = logging.getLogger(__name__)

_TIMEOUT = httpx.Timeout(30.0, connect=10.0)
_TARBALL_TIMEOUT = httpx.Timeout(120.0, connect=10.0)

_ARXIV_API_BASE = "https://export.arxiv.org/api/query"
_ARXIV_SRC_BASE = "https://arxiv.org/src"
_ARXIV_ABS_BASE = "https://arxiv.org/abs"

_ATOM_NS = {"atom": "http://www.w3.org/2005/Atom", "arxiv": "http://arxiv.org/schemas/atom"}

_ARXIV_ID_RE = re.compile(
    r"(?:arxiv[:\s]*)?(\d{4}\.\d{4,5}(?:v\d+)?)", re.IGNORECASE
)
_ARXIV_URL_RE = re.compile(
    r"arxiv\.org/(?:abs|pdf|src)/(\d{4}\.\d{4,5}(?:v\d+)?)"
)


def parse_arxiv_id(raw: str) -> str:
    """Extract a bare arXiv ID from a URL, prefixed string, or bare ID.

    Supports:
        2310.06825
        2310.06825v2
        arxiv:2310.06825
        https://arxiv.org/abs/2310.06825
        https://arxiv.org/pdf/2310.06825v1
    """
    raw = raw.strip()

    m = _ARXIV_URL_RE.search(raw)
    if m:
        return m.group(1)

    m = _ARXIV_ID_RE.search(raw)
    if m:
        return m.group(1)

    raise ValueError("Could not parse arXiv ID from: {}".format(raw))


async def fetch_paper_metadata(arxiv_id: str) -> Dict[str, Any]:
    """Fetch paper metadata from the arXiv Atom API.

    Returns dict with: title, abstract, authors, categories,
    published, updated, doi, arxiv_id, arxiv_url.
    """
    bare_id = arxiv_id.split("v")[0]
    logger.info("[ARXIV] Fetching metadata for %s", bare_id)

    params = {"id_list": bare_id, "max_results": "1"}
    async with httpx.AsyncClient(timeout=_TIMEOUT, follow_redirects=True) as client:
        resp = await client.get(_ARXIV_API_BASE, params=params)
        resp.raise_for_status()

    root = ElementTree.fromstring(resp.text)
    entry = root.find("atom:entry", _ATOM_NS)
    if entry is None:
        raise ValueError("No results found for arXiv ID: {}".format(arxiv_id))

    title_el = entry.find("atom:title", _ATOM_NS)
    title = " ".join((title_el.text or "").split()) if title_el is not None else ""

    summary_el = entry.find("atom:summary", _ATOM_NS)
    abstract = " ".join((summary_el.text or "").split()) if summary_el is not None else ""

    authors: List[Dict[str, str]] = []
    for author_el in entry.findall("atom:author", _ATOM_NS):
        name_el = author_el.find("atom:name", _ATOM_NS)
        if name_el is not None and name_el.text:
            authors.append({"name": name_el.text.strip()})

    categories: List[str] = []
    for cat_el in entry.findall("atom:category", _ATOM_NS):
        term = cat_el.get("term")
        if term:
            categories.append(term)

    published_el = entry.find("atom:published", _ATOM_NS)
    published = (published_el.text or "").strip() if published_el is not None else ""

    doi_el = entry.find("arxiv:doi", _ATOM_NS)
    doi = (doi_el.text or "").strip() if doi_el is not None else ""

    logger.info(
        "[ARXIV] %s: '%s' by %d authors, %d categories",
        bare_id, title[:60], len(authors), len(categories),
    )

    return {
        "arxiv_id": bare_id,
        "arxiv_url": "{}/{}".format(_ARXIV_ABS_BASE, bare_id),
        "title": title,
        "abstract": abstract,
        "authors": authors,
        "categories": categories,
        "published": published,
        "doi": doi,
    }


async def download_paper_source(arxiv_id: str) -> Optional[str]:
    """Download and extract the LaTeX source tarball for a paper.

    Returns path to extracted directory, or None if source is unavailable.
    Caller is responsible for cleanup via shutil.rmtree(os.path.dirname(path)).
    """
    bare_id = arxiv_id.split("v")[0]
    url = "{}/{}".format(_ARXIV_SRC_BASE, bare_id)
    logger.info("[ARXIV] Downloading source for %s", bare_id)

    tmp_dir = tempfile.mkdtemp(prefix="arxiv_src_")
    tarball_path = os.path.join(tmp_dir, "source.tar.gz")

    async with httpx.AsyncClient(timeout=_TARBALL_TIMEOUT, follow_redirects=True) as client:
        resp = await client.get(url)
        if resp.status_code in (404, 403):
            logger.info("[ARXIV] No source available for %s", bare_id)
            os.rmdir(tmp_dir)
            return None
        resp.raise_for_status()

    content_type = resp.headers.get("content-type", "")
    with open(tarball_path, "wb") as f:
        f.write(resp.content)

    size_kb = len(resp.content) / 1024
    logger.info("[ARXIV] Source downloaded for %s (%.1f KB, type=%s)", bare_id, size_kb, content_type)

    if "gzip" in content_type or "tar" in content_type or tarball_path.endswith(".gz"):
        try:
            with tarfile.open(tarball_path) as tar:
                tar.extractall(tmp_dir)
            os.remove(tarball_path)
        except tarfile.TarError:
            logger.info("[ARXIV] Source for %s is a single TeX file, not a tarball", bare_id)
            tex_path = os.path.join(tmp_dir, "main.tex")
            os.rename(tarball_path, tex_path)
    else:
        tex_path = os.path.join(tmp_dir, "main.tex")
        os.rename(tarball_path, tex_path)

    logger.info("[ARXIV] Source extracted for %s to %s", bare_id, tmp_dir)
    return tmp_dir
