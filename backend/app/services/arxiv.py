"""arXiv API client.

Handles paper metadata fetching and LaTeX source tarball download/extraction.
Includes retry-with-backoff for 429 rate limits and a global throttle to
respect arXiv's legacy API terms (single connection, <= 1 request / 3 sec).
"""

import asyncio
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
_ARXIV_PDF_BASE = "https://arxiv.org/pdf"

_ATOM_NS = {
    "atom": "http://www.w3.org/2005/Atom",
    "arxiv": "http://arxiv.org/schemas/atom",
}

_MAX_RETRIES = 4
_BACKOFF_BASE = 3.0

_metadata_cache: Dict[str, Dict[str, Any]] = {}
_MIN_SECONDS_BETWEEN_REQUESTS = 3.1
_BLOCK_WINDOW_SECONDS = 300.0
_ARXIV_HEADERS = {
    "User-Agent": "ContributionTracer/1.0",
}

_request_lock: Optional[asyncio.Lock] = None
_last_request_started_at: float = 0.0
_api_blocked_until: float = 0.0

_ARXIV_ID_RE = re.compile(r"(?:arxiv[:\s]*)?(\d{4}\.\d{4,5}(?:v\d+)?)", re.IGNORECASE)
_ARXIV_URL_RE = re.compile(r"arxiv\.org/(?:abs|pdf|src)/(\d{4}\.\d{4,5}(?:v\d+)?)")


def _get_request_lock() -> asyncio.Lock:
    """Lazily create a process-local lock used to serialize arXiv requests."""
    global _request_lock
    if _request_lock is None:
        _request_lock = asyncio.Lock()
    return _request_lock


async def _throttled_get(
    client: httpx.AsyncClient,
    url: str,
    *,
    params: Optional[Dict[str, str]] = None,
) -> httpx.Response:
    """Issue a GET request while enforcing the global arXiv rate policy."""
    global _last_request_started_at

    async with _get_request_lock():
        now = asyncio.get_running_loop().time()
        if _last_request_started_at > 0:
            elapsed = now - _last_request_started_at
            if elapsed < _MIN_SECONDS_BETWEEN_REQUESTS:
                wait = _MIN_SECONDS_BETWEEN_REQUESTS - elapsed
                logger.info(
                    "[ARXIV] Throttling for %.1fs (respecting 1 request / 3s)",
                    wait,
                )
                await asyncio.sleep(wait)

        _last_request_started_at = asyncio.get_running_loop().time()
        return await client.get(url, params=params, headers=_ARXIV_HEADERS)


async def _get_with_retries(
    client: httpx.AsyncClient,
    url: str,
    *,
    params: Optional[Dict[str, str]] = None,
    label: str = "request",
) -> httpx.Response:
    """GET with 429 retry handling and exponential backoff."""
    global _api_blocked_until

    now = asyncio.get_running_loop().time()
    if url.startswith(_ARXIV_API_BASE) and _api_blocked_until > now:
        remaining = int(_api_blocked_until - now)
        raise RuntimeError(
            "arXiv API cooldown active ({}s remaining due to prior 429s)".format(
                remaining
            )
        )

    resp = await _throttled_get(client, url, params=params)

    if resp.status_code == 429 and "rate exceeded" in (resp.text or "").lower():
        if url.startswith(_ARXIV_API_BASE):
            _api_blocked_until = (
                asyncio.get_running_loop().time() + _BLOCK_WINDOW_SECONDS
            )
            logger.warning(
                "[ARXIV] Immediate cooldown for %.0fs (received 'Rate exceeded')",
                _BLOCK_WINDOW_SECONDS,
            )
        return resp

    retries = 0
    while resp.status_code == 429 and retries < _MAX_RETRIES:
        retry_after = resp.headers.get("retry-after")
        wait = _BACKOFF_BASE * (2**retries)
        if retry_after:
            try:
                wait = max(wait, float(retry_after))
            except ValueError:
                pass
        logger.info(
            "[ARXIV] Rate limited (429) on %s, retrying in %.0fs (%d/%d)",
            label,
            wait,
            retries + 1,
            _MAX_RETRIES,
        )
        await asyncio.sleep(wait)
        resp = await _throttled_get(client, url, params=params)
        retries += 1

    if resp.status_code == 429:
        if url.startswith(_ARXIV_API_BASE):
            _api_blocked_until = (
                asyncio.get_running_loop().time() + _BLOCK_WINDOW_SECONDS
            )
            logger.warning(
                "[ARXIV] Entering API cooldown for %.0fs due to persistent 429s",
                _BLOCK_WINDOW_SECONDS,
            )
        logger.warning(
            "[ARXIV] Persistent 429 on %s after retries. Response: %.200s",
            label,
            (resp.text or "").strip(),
        )

    return resp


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

    Retries with exponential backoff on 429 rate limits.
    Results are cached in-memory to avoid redundant calls.

    Returns dict with: title, abstract, authors, categories,
    published, updated, doi, arxiv_id, arxiv_url.
    """
    bare_id = arxiv_id.split("v")[0]

    if bare_id in _metadata_cache:
        logger.info("[ARXIV] Cache hit for %s", bare_id)
        return _metadata_cache[bare_id]

    logger.info("[ARXIV] Fetching metadata for %s", bare_id)

    params = {"id_list": bare_id, "max_results": "1"}
    async with httpx.AsyncClient(timeout=_TIMEOUT, follow_redirects=True) as client:
        resp = await _get_with_retries(
            client,
            _ARXIV_API_BASE,
            params=params,
            label="metadata {}".format(bare_id),
        )
        resp.raise_for_status()

    root = ElementTree.fromstring(resp.text)
    entry = root.find("atom:entry", _ATOM_NS)
    if entry is None:
        raise ValueError("No results found for arXiv ID: {}".format(arxiv_id))

    title_el = entry.find("atom:title", _ATOM_NS)
    title = " ".join((title_el.text or "").split()) if title_el is not None else ""

    summary_el = entry.find("atom:summary", _ATOM_NS)
    abstract = (
        " ".join((summary_el.text or "").split()) if summary_el is not None else ""
    )

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
        bare_id,
        title[:60],
        len(authors),
        len(categories),
    )

    result = {
        "arxiv_id": bare_id,
        "arxiv_url": "{}/{}".format(_ARXIV_ABS_BASE, bare_id),
        "title": title,
        "abstract": abstract,
        "authors": authors,
        "categories": categories,
        "published": published,
        "doi": doi,
    }
    _metadata_cache[bare_id] = result
    return result


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

    async with httpx.AsyncClient(
        timeout=_TARBALL_TIMEOUT, follow_redirects=True
    ) as client:
        resp = await _get_with_retries(
            client,
            url,
            label="source {}".format(bare_id),
        )

        if resp.status_code in (404, 403):
            logger.info("[ARXIV] No source available for %s", bare_id)
            os.rmdir(tmp_dir)
            return None
        resp.raise_for_status()

    content_type = resp.headers.get("content-type", "")
    with open(tarball_path, "wb") as f:
        f.write(resp.content)

    size_kb = len(resp.content) / 1024
    logger.info(
        "[ARXIV] Source downloaded for %s (%.1f KB, type=%s)",
        bare_id,
        size_kb,
        content_type,
    )

    if "gzip" in content_type or "tar" in content_type or tarball_path.endswith(".gz"):
        try:
            with tarfile.open(tarball_path) as tar:
                tar.extractall(tmp_dir)
            os.remove(tarball_path)
        except tarfile.TarError:
            logger.info(
                "[ARXIV] Source for %s is a single TeX file, not a tarball", bare_id
            )
            tex_path = os.path.join(tmp_dir, "main.tex")
            os.rename(tarball_path, tex_path)
    else:
        tex_path = os.path.join(tmp_dir, "main.tex")
        os.rename(tarball_path, tex_path)

    logger.info("[ARXIV] Source extracted for %s to %s", bare_id, tmp_dir)
    return tmp_dir


async def download_paper_pdf(arxiv_id: str) -> Optional[str]:
    """Download a paper PDF. Returns path to PDF file in a temp directory.

    Caller is responsible for cleanup via shutil.rmtree(os.path.dirname(path)).
    """
    bare_id = arxiv_id.split("v")[0]
    url = "{}/{}.pdf".format(_ARXIV_PDF_BASE, bare_id)
    logger.info("[ARXIV] Downloading PDF for %s", bare_id)

    tmp_dir = tempfile.mkdtemp(prefix="arxiv_pdf_")
    pdf_path = os.path.join(tmp_dir, "paper.pdf")

    async with httpx.AsyncClient(
        timeout=_TARBALL_TIMEOUT, follow_redirects=True
    ) as client:
        resp = await _get_with_retries(
            client,
            url,
            label="pdf {}".format(bare_id),
        )

        if resp.status_code in (404, 403):
            logger.info("[ARXIV] No PDF available for %s", bare_id)
            os.rmdir(tmp_dir)
            return None
        resp.raise_for_status()

    with open(pdf_path, "wb") as f:
        f.write(resp.content)

    size_kb = len(resp.content) / 1024
    logger.info("[ARXIV] PDF downloaded for %s (%.1f KB)", bare_id, size_kb)
    return pdf_path
