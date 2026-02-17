import re
from typing import Dict, List, Tuple
from urllib.parse import urlparse

import httpx

from app.config import settings
from app.schemas.contributions import Contributor


_GITHUB_REPO_PATTERN = re.compile(r"^/(?P<owner>[^/]+)/(?P<repo>[^/.]+?)(?:\.git)?/?$")


def parse_repo_owner_and_name(repo_url: str) -> Tuple[str, str]:
    """Extract owner and repo name from a GitHub URL.

    Supports:
        https://github.com/owner/repo
        https://github.com/owner/repo.git
        https://github.com/owner/repo/
    """
    parsed = urlparse(str(repo_url))

    if parsed.hostname not in ("github.com", "www.github.com"):
        raise ValueError(f"Not a GitHub URL: {repo_url}")

    match = _GITHUB_REPO_PATTERN.match(parsed.path)
    if not match:
        raise ValueError(f"Could not parse owner/repo from URL: {repo_url}")

    return match.group("owner"), match.group("repo")


async def fetch_top_contributors(
    repo_url: str,
    *,
    limit: int = 10,
) -> List[Contributor]:
    """Fetch the top contributors for a GitHub repository."""
    owner, repo = parse_repo_owner_and_name(repo_url)

    headers: Dict[str, str] = {"Accept": "application/vnd.github+json"}
    if settings.github_token:
        headers["Authorization"] = f"Bearer {settings.github_token}"

    url = f"{settings.github_api_base}/repos/{owner}/{repo}/contributors"
    params = {"per_page": limit * 2, "anon": "false"}

    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(url, headers=headers, params=params)
        response.raise_for_status()

    contributors_data: List[Dict] = response.json()

    return [
        Contributor(
            username=c["login"],
            contributions=c["contributions"],
        )
        for c in contributors_data
        if "[bot]" not in c["login"]
    ][:limit]
