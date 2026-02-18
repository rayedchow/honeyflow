"""Resolve package names to their source GitHub URLs via registry APIs.

Supports npm, PyPI, crates.io, and Go modules.
"""

import logging
import re
from typing import Dict, Optional

import httpx

logger = logging.getLogger(__name__)

_TIMEOUT = httpx.Timeout(10.0, connect=5.0)

_cache: Dict[str, Optional[str]] = {}

_GITHUB_URL_RE = re.compile(r"https?://github\.com/([^/]+)/([^/.#]+)")


def _extract_github_url(raw: Optional[str]) -> Optional[str]:
    """Normalize a URL string into a clean https://github.com/owner/repo form."""
    if not raw:
        return None
    raw = raw.replace("git+", "").replace("git://", "https://").rstrip(".git").rstrip("/")
    m = _GITHUB_URL_RE.search(raw)
    if m:
        return "https://github.com/{}/{}".format(m.group(1), m.group(2))
    return None


async def _resolve_npm(name: str) -> Optional[str]:
    url = "https://registry.npmjs.org/{}".format(name)
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.get(url)
        if resp.status_code != 200:
            return None
    data = resp.json()
    repo = data.get("repository")
    if isinstance(repo, dict):
        return _extract_github_url(repo.get("url"))
    if isinstance(repo, str):
        return _extract_github_url(repo)
    return None


async def _resolve_pypi(name: str) -> Optional[str]:
    url = "https://pypi.org/pypi/{}/json".format(name)
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.get(url)
        if resp.status_code != 200:
            return None
    data = resp.json()
    urls = data.get("info", {}).get("project_urls") or {}
    for key in ("Source", "Source Code", "Repository", "GitHub", "Homepage", "Code"):
        val = urls.get(key)
        gh = _extract_github_url(val)
        if gh:
            return gh
    home = data.get("info", {}).get("home_page")
    return _extract_github_url(home)


async def _resolve_crates(name: str) -> Optional[str]:
    url = "https://crates.io/api/v1/crates/{}".format(name)
    headers = {"User-Agent": "contribution-tracer/1.0"}
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.get(url, headers=headers)
        if resp.status_code != 200:
            return None
    data = resp.json()
    repo_url = data.get("crate", {}).get("repository")
    return _extract_github_url(repo_url)


def _resolve_go(name: str) -> Optional[str]:
    """Go modules hosted on github.com map directly."""
    if name.startswith("github.com/"):
        parts = name.split("/")
        if len(parts) >= 3:
            return "https://github.com/{}/{}".format(parts[1], parts[2])
    return None


async def resolve_to_github_url(
    package_name: str,
    ecosystem: str,
) -> Optional[str]:
    """Resolve a package name to its GitHub repo URL. Results are cached."""
    cache_key = "{}:{}".format(ecosystem, package_name)
    if cache_key in _cache:
        cached = _cache[cache_key]
        logger.info("[REG]  Cache hit  %s:%s -> %s", ecosystem, package_name,
                    cached or "(not on GitHub)")
        return cached

    result: Optional[str] = None
    try:
        logger.info("[REG]  Resolving  %s:%s ...", ecosystem, package_name)
        if ecosystem == "npm":
            result = await _resolve_npm(package_name)
        elif ecosystem == "pypi":
            result = await _resolve_pypi(package_name)
        elif ecosystem == "crates":
            result = await _resolve_crates(package_name)
        elif ecosystem == "go":
            result = _resolve_go(package_name)
    except Exception as exc:
        logger.warning("[REG]  Failed to resolve %s:%s: %s", ecosystem, package_name, exc)
        result = None

    _cache[cache_key] = result
    logger.info("[REG]  Resolved   %s:%s -> %s", ecosystem, package_name,
                result or "(not found)")
    return result
