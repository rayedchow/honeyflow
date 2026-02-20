"""Fetch package metadata and dependency lists from npm and PyPI registries.

Provides a unified PackageInfo dataclass regardless of ecosystem, with
caching to avoid redundant API calls during recursive graph traversal.
"""

import logging
import re
from dataclasses import dataclass, field
from typing import Dict, List, Optional

import httpx

from app.services.parsers.manifest import Dependency

logger = logging.getLogger(__name__)

_TIMEOUT = httpx.Timeout(15.0, connect=5.0)

_info_cache: Dict[str, "PackageInfo"] = {}

_GITHUB_URL_RE = re.compile(r"https?://github\.com/([^/]+)/([^/#]+)")
_PEP508_NAME_RE = re.compile(r"^([A-Za-z0-9]([A-Za-z0-9._-]*[A-Za-z0-9])?)")
_PEP508_EXTRA_RE = re.compile(r"extra\s*==\s*[\"']", re.IGNORECASE)


@dataclass
class PackageInfo:
    name: str
    description: str
    keywords: List[str] = field(default_factory=list)
    latest_version: Optional[str] = None
    homepage: Optional[str] = None
    github_url: Optional[str] = None
    dependencies: List[Dependency] = field(default_factory=list)


def _extract_github_url(raw: Optional[str]) -> Optional[str]:
    """Normalize a URL string into a clean https://github.com/owner/repo form."""
    if not raw:
        return None
    raw = raw.replace("git+", "").replace("git://", "https://").rstrip("/")
    if raw.endswith(".git"):
        raw = raw[:-4]
    m = _GITHUB_URL_RE.search(raw)
    if m:
        return "https://github.com/{}/{}".format(m.group(1), m.group(2))
    return None


# ------------------------------------------------------------------
# npm
# ------------------------------------------------------------------


async def _fetch_npm(name: str) -> PackageInfo:
    """Fetch package info from the npm registry."""
    url = "https://registry.npmjs.org/{}".format(name)
    async with httpx.AsyncClient(timeout=_TIMEOUT, follow_redirects=True) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        data = resp.json()

    latest_tag = (data.get("dist-tags") or {}).get("latest")
    latest_data = (
        (data.get("versions") or {}).get(latest_tag, {}) if latest_tag else {}
    )

    deps: List[Dependency] = []
    for dep_name, ver in (latest_data.get("dependencies") or {}).items():
        deps.append(Dependency(name=dep_name, version=ver, dev_only=False))
    for dep_name, ver in (latest_data.get("devDependencies") or {}).items():
        deps.append(Dependency(name=dep_name, version=ver, dev_only=True))

    repo = data.get("repository")
    github_url = None
    if isinstance(repo, dict):
        github_url = _extract_github_url(repo.get("url"))
    elif isinstance(repo, str):
        github_url = _extract_github_url(repo)

    return PackageInfo(
        name=data.get("name", name),
        description=data.get("description", ""),
        keywords=data.get("keywords") or [],
        latest_version=latest_tag,
        homepage=data.get("homepage"),
        github_url=github_url,
        dependencies=deps,
    )


# ------------------------------------------------------------------
# PyPI
# ------------------------------------------------------------------


def _parse_pep508_name(requirement: str) -> Optional[str]:
    """Extract the package name from a PEP 508 requirement string."""
    m = _PEP508_NAME_RE.match(requirement.strip())
    return m.group(1) if m else None


def _is_extra_dep(requirement: str) -> bool:
    """Check if a PEP 508 requirement is gated behind an extra."""
    return bool(_PEP508_EXTRA_RE.search(requirement))


async def _fetch_pypi(name: str) -> PackageInfo:
    """Fetch package info from the PyPI JSON API."""
    url = "https://pypi.org/pypi/{}/json".format(name)
    async with httpx.AsyncClient(timeout=_TIMEOUT, follow_redirects=True) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        data = resp.json()

    info = data.get("info", {})

    deps: List[Dependency] = []
    for req_str in info.get("requires_dist") or []:
        dep_name = _parse_pep508_name(req_str)
        if not dep_name:
            continue
        dev_only = _is_extra_dep(req_str)
        ver_match = re.search(r"([><=!~]+[\d.*]+)", req_str)
        version = ver_match.group(0) if ver_match else None
        deps.append(Dependency(name=dep_name, version=version, dev_only=dev_only))

    github_url = None
    project_urls = info.get("project_urls") or {}
    for key in ("Source", "Source Code", "Repository", "GitHub", "Homepage", "Code"):
        gh = _extract_github_url(project_urls.get(key))
        if gh:
            github_url = gh
            break
    if not github_url:
        github_url = _extract_github_url(info.get("home_page"))

    raw_kw = info.get("keywords") or ""
    keywords = [k.strip() for k in raw_kw.split(",") if k.strip()] if raw_kw else []

    return PackageInfo(
        name=info.get("name", name),
        description=info.get("summary", ""),
        keywords=keywords,
        latest_version=info.get("version"),
        homepage=info.get("home_page"),
        github_url=github_url,
        dependencies=deps,
    )


# ------------------------------------------------------------------
# Public API
# ------------------------------------------------------------------


async def fetch_package_info(name: str, ecosystem: str) -> PackageInfo:
    """Fetch package metadata and dependencies. Results are cached."""
    cache_key = "{}:{}".format(ecosystem, name.lower())
    if cache_key in _info_cache:
        logger.info("[PKG]  Cache hit  %s:%s", ecosystem, name)
        return _info_cache[cache_key]

    logger.info("[PKG]  Fetching   %s:%s ...", ecosystem, name)
    try:
        if ecosystem == "npm":
            info = await _fetch_npm(name)
        elif ecosystem == "pypi":
            info = await _fetch_pypi(name)
        else:
            raise ValueError("Unsupported ecosystem: {}".format(ecosystem))
    except httpx.HTTPStatusError:
        raise
    except Exception as exc:
        logger.warning("[PKG]  Failed to fetch %s:%s: %s", ecosystem, name, exc)
        raise

    _info_cache[cache_key] = info
    logger.info(
        "[PKG]  Fetched    %s:%s -> v%s, %d deps, github=%s",
        ecosystem,
        name,
        info.latest_version or "?",
        len(info.dependencies),
        info.github_url or "(none)",
    )
    return info
