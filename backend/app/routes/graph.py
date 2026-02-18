from fastapi import APIRouter, HTTPException
from httpx import HTTPStatusError

from app.schemas.graph import TraceGraphRequest, TraceGraphResponse
from app.services.github import parse_repo_owner_and_name
from app.services.graph_builder import build_contribution_graph

router = APIRouter(tags=["graph"])


@router.post("/trace_graph", response_model=TraceGraphResponse)
async def trace_graph(body: TraceGraphRequest):
    """Build a full contribution attribution graph for a GitHub repository.

    Traces direct code contributors, package dependencies, and transitive
    dependencies recursively up to the configured depth.
    """
    repo_url = str(body.repo_url)

    try:
        owner, repo = parse_repo_owner_and_name(repo_url)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    try:
        graph, config, attribution = await build_contribution_graph(
            repo_url,
            max_depth=body.max_depth,
            max_children=body.max_children,
        )
    except HTTPStatusError as exc:
        status = exc.response.status_code
        if status == 404:
            raise HTTPException(status_code=404, detail="Repository not found")
        raise HTTPException(
            status_code=502,
            detail="GitHub API returned {}".format(status),
        )

    return TraceGraphResponse(
        repo="{}/{}".format(owner, repo),
        config=config,
        graph=graph,
        user_attribution=attribution,
    )
