from fastapi import APIRouter, HTTPException
from httpx import HTTPStatusError

from app.schemas.contributions import (
    TraceContributionsRequest,
    TraceContributionsResponse,
)
from app.services.github import fetch_top_contributors, parse_repo_owner_and_name

router = APIRouter(tags=["contributions"])


@router.post("/trace_contributions", response_model=TraceContributionsResponse)
async def trace_contributions(body: TraceContributionsRequest):
    """Trace a GitHub repo and return the top 10 contributors by commit count."""
    repo_url = str(body.repo_url)

    try:
        owner, repo = parse_repo_owner_and_name(repo_url)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    try:
        contributors = await fetch_top_contributors(repo_url, limit=10)
    except HTTPStatusError as exc:
        status = exc.response.status_code
        if status == 404:
            raise HTTPException(status_code=404, detail="Repository not found")
        raise HTTPException(
            status_code=502,
            detail=f"GitHub API returned {status}",
        )

    return TraceContributionsResponse(
        repo=f"{owner}/{repo}",
        top_contributors=contributors,
    )
