"""GitHub API client.

Handles contributor fetching, repo metadata, README, tarball download,
and detailed contributor stats.
"""

import logging
import os
import re
import tarfile
import tempfile
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse

import httpx

from app.config import settings
from app.schemas.contributions import Contributor

logger = logging.getLogger(__name__)


_TIMEOUT = httpx.Timeout(30.0, connect=10.0)
_TARBALL_TIMEOUT = httpx.Timeout(120.0, connect=10.0)


def _headers() -> Dict[str, str]:
    h: Dict[str, str] = {"Accept": "application/vnd.github+json"}
    if settings.github_token:
        h["Authorization"] = "Bearer {}".format(settings.github_token)
    return h


def parse_repo_owner_and_name(repo_url: str) -> Tuple[str, str]:
    """Extract owner and repo name from a GitHub URL.

    Supports (and normalizes to owner/repo):
        https://github.com/owner/repo
        https://github.com/owner/repo.git
        https://github.com/owner/repo/
        https://github.com/owner/repo/tree/main
        https://github.com/owner/repo/issues/123
    """
    parsed = urlparse(str(repo_url))

    if parsed.hostname not in ("github.com", "www.github.com"):
        raise ValueError("Not a GitHub URL: {}".format(repo_url))

    parts = [p for p in parsed.path.split("/") if p]
    if len(parts) < 2:
        raise ValueError("Could not parse owner/repo from URL: {}".format(repo_url))
    owner = parts[0]
    repo = parts[1]
    if repo.endswith(".git"):
        repo = repo[:-4]
    if not owner or not repo:
        raise ValueError("Could not parse owner/repo from URL: {}".format(repo_url))
    return owner, repo


# ------------------------------------------------------------------
# Basic contributor list (used by /trace_contributions)
# ------------------------------------------------------------------


async def fetch_top_contributors(
    repo_url: str,
    *,
    limit: int = 10,
) -> List[Contributor]:
    """Fetch the top contributors for a GitHub repository."""
    owner, repo = parse_repo_owner_and_name(repo_url)

    url = "{}/repos/{}/{}/contributors".format(settings.github_api_base, owner, repo)
    params: Dict[str, Any] = {"per_page": limit * 2, "anon": "false"}

    logger.info("GET  %s/%s contributors (limit=%d)", owner, repo, limit)
    async with httpx.AsyncClient(timeout=_TIMEOUT, follow_redirects=True) as client:
        response = await client.get(url, headers=_headers(), params=params)
        response.raise_for_status()

    data: List[Dict] = response.json()

    return [
        Contributor(username=c["login"], contributions=c["contributions"])
        for c in data
        if "[bot]" not in c["login"]
    ][:limit]


# ------------------------------------------------------------------
# Repo metadata
# ------------------------------------------------------------------


async def fetch_repo_metadata(owner: str, repo: str) -> Dict[str, Any]:
    """Fetch basic repo info and language breakdown."""
    logger.info("GET  %s/%s metadata + languages", owner, repo)
    base = settings.github_api_base
    async with httpx.AsyncClient(timeout=_TIMEOUT, follow_redirects=True) as client:
        repo_resp = await client.get(
            "{}/repos/{}/{}".format(base, owner, repo), headers=_headers()
        )
        repo_resp.raise_for_status()
        repo_data = repo_resp.json()

        lang_resp = await client.get(
            "{}/repos/{}/{}/languages".format(base, owner, repo), headers=_headers()
        )
        languages = lang_resp.json() if lang_resp.status_code == 200 else {}

    logger.info(
        "     %s/%s -> %s, %d languages",
        owner,
        repo,
        repo_data.get("description", "")[:60],
        len(languages),
    )
    return {
        "description": repo_data.get("description") or "",
        "default_branch": repo_data.get("default_branch", "main"),
        "size_kb": repo_data.get("size", 0),
        "languages": languages,
        "html_url": repo_data.get("html_url", ""),
    }


async def fetch_readme(owner: str, repo: str, max_chars: int = 4000) -> str:
    """Fetch raw README content, truncated for LLM context."""
    logger.info("GET  %s/%s README", owner, repo)
    url = "{}/repos/{}/{}/readme".format(settings.github_api_base, owner, repo)
    headers = {**_headers(), "Accept": "application/vnd.github.raw+json"}

    async with httpx.AsyncClient(timeout=_TIMEOUT, follow_redirects=True) as client:
        resp = await client.get(url, headers=headers)
        if resp.status_code == 404:
            logger.info("     %s/%s README not found", owner, repo)
            return ""
        resp.raise_for_status()

    text = resp.text[:max_chars]
    logger.info("     %s/%s README fetched (%d chars)", owner, repo, len(text))
    return text


# ------------------------------------------------------------------
# Tarball download + extract
# ------------------------------------------------------------------


async def download_repo_tarball(owner: str, repo: str) -> str:
    """Download and extract a repo tarball. Returns path to extracted root.

    Caller is responsible for cleaning up the parent temp directory via
    ``shutil.rmtree(os.path.dirname(returned_path))``.
    """
    logger.info("GET  %s/%s tarball (downloading source archive)", owner, repo)
    url = "{}/repos/{}/{}/tarball".format(settings.github_api_base, owner, repo)
    tmp_dir = tempfile.mkdtemp(prefix="repotrace_")
    tarball_path = os.path.join(tmp_dir, "repo.tar.gz")

    async with httpx.AsyncClient(
        timeout=_TARBALL_TIMEOUT, follow_redirects=True
    ) as client:
        resp = await client.get(url, headers=_headers())
        resp.raise_for_status()

    size_mb = len(resp.content) / (1024 * 1024)
    logger.info("     %s/%s tarball downloaded (%.1f MB)", owner, repo, size_mb)

    with open(tarball_path, "wb") as f:
        f.write(resp.content)

    with tarfile.open(tarball_path) as tar:
        tar.extractall(tmp_dir)

    os.remove(tarball_path)

    subdirs = [
        d for d in os.listdir(tmp_dir) if os.path.isdir(os.path.join(tmp_dir, d))
    ]
    extracted = os.path.join(tmp_dir, subdirs[0]) if subdirs else tmp_dir
    logger.info("     %s/%s tarball extracted to %s", owner, repo, extracted)
    return extracted


# ------------------------------------------------------------------
# File tree (from an extracted directory)
# ------------------------------------------------------------------


def build_file_tree(source_dir: str, max_depth: int = 2) -> str:
    """Build a compact string representation of the file tree."""
    lines: List[str] = []
    base = os.path.basename(source_dir)
    skip = {
        "node_modules",
        ".git",
        "__pycache__",
        ".venv",
        "venv",
        "target",
        "dist",
        "build",
    }

    def _walk(path: str, prefix: str, depth: int) -> None:
        if depth > max_depth:
            return
        try:
            entries = sorted(os.listdir(path))
        except OSError:
            return
        dirs = [
            e for e in entries if os.path.isdir(os.path.join(path, e)) and e not in skip
        ]
        files = [e for e in entries if os.path.isfile(os.path.join(path, e))]
        for f in files:
            lines.append("{}{}".format(prefix, f))
        for d in dirs:
            lines.append("{}{}/".format(prefix, d))
            _walk(os.path.join(path, d), prefix + "  ", depth + 1)

    lines.append("{}/".format(base))
    _walk(source_dir, "  ", 0)
    return "\n".join(lines[:200])


# ------------------------------------------------------------------
# Detailed contributor stats (with lines changed)
# ------------------------------------------------------------------


async def fetch_contributor_stats(owner: str, repo: str) -> List[Dict[str, Any]]:
    """Fetch per-author contribution stats.

    Tries the detailed /stats/contributors endpoint first (gives lines changed).
    Falls back to the simpler /contributors endpoint (commit counts only) if
    the stats endpoint keeps returning 202.
    """
    import asyncio

    stats_url = "{}/repos/{}/{}/stats/contributors".format(
        settings.github_api_base, owner, repo
    )

    logger.info("GET  %s/%s stats/contributors (detailed)", owner, repo)
    async with httpx.AsyncClient(timeout=_TIMEOUT, follow_redirects=True) as client:
        resp = await client.get(stats_url, headers=_headers())

        retries = 3
        while resp.status_code == 202 and retries > 0:
            logger.info(
                "     %s/%s GitHub is computing stats, waiting... (%d/3)",
                owner,
                repo,
                4 - retries,
            )
            await asyncio.sleep(3)
            resp = await client.get(stats_url, headers=_headers())
            retries -= 1

        if resp.status_code == 200:
            raw: List[Dict] = resp.json()
            if isinstance(raw, list) and raw:
                logger.info(
                    "     %s/%s got detailed stats for %d contributors",
                    owner,
                    repo,
                    len(raw),
                )
                return _parse_detailed_stats(raw)

        logger.info(
            "     %s/%s detailed stats not ready yet, using basic contributor list instead",
            owner,
            repo,
        )
        fallback_url = "{}/repos/{}/{}/contributors".format(
            settings.github_api_base, owner, repo
        )
        resp = await client.get(
            fallback_url, headers=_headers(), params={"per_page": 30}
        )
        if resp.status_code != 200:
            logger.warning(
                "     %s/%s contributors fallback also failed (%d)",
                owner,
                repo,
                resp.status_code,
            )
            return []

    data: List[Dict] = resp.json()
    return [
        {
            "login": c["login"],
            "avatar_url": c.get("avatar_url", ""),
            "total_commits": c.get("contributions", 0),
            "total_additions": 0,
            "total_deletions": 0,
            "total_lines": c.get("contributions", 0),
        }
        for c in data
        if "[bot]" not in c.get("login", "")
    ]


def _parse_detailed_stats(raw: List[Dict]) -> List[Dict[str, Any]]:
    results: List[Dict[str, Any]] = []
    for entry in raw:
        author = entry.get("author")
        if not author or "[bot]" in author.get("login", ""):
            continue
        weeks = entry.get("weeks", [])
        total_add = sum(w.get("a", 0) for w in weeks)
        total_del = sum(w.get("d", 0) for w in weeks)
        total_commits = sum(w.get("c", 0) for w in weeks)
        results.append(
            {
                "login": author["login"],
                "avatar_url": author.get("avatar_url", ""),
                "total_commits": total_commits,
                "total_additions": total_add,
                "total_deletions": total_del,
                "total_lines": total_add + total_del,
            }
        )
    results.sort(key=lambda x: x["total_lines"], reverse=True)
    return results


# ------------------------------------------------------------------
# Fetch a single file via Contents API (for dep manifests at depth > 0)
# ------------------------------------------------------------------


async def fetch_file_content(owner: str, repo: str, path: str) -> Optional[str]:
    """Fetch a single file from a repo via the Contents API."""
    logger.info("GET  %s/%s contents/%s", owner, repo, path)
    url = "{}/repos/{}/{}/contents/{}".format(
        settings.github_api_base, owner, repo, path
    )
    headers = {**_headers(), "Accept": "application/vnd.github.raw+json"}

    async with httpx.AsyncClient(timeout=_TIMEOUT, follow_redirects=True) as client:
        resp = await client.get(url, headers=headers)
        if resp.status_code != 200:
            logger.info(
                "     %s/%s %s not found (%d)", owner, repo, path, resp.status_code
            )
            return None

    logger.info("     %s/%s %s fetched (%d bytes)", owner, repo, path, len(resp.text))
    return resp.text
