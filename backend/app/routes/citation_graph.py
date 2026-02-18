"""Citation graph tracing endpoint."""

from fastapi import APIRouter, HTTPException

from app.schemas.citation_graph import (
    TraceCitationGraphRequest,
    TraceCitationGraphResponse,
)
from app.services.arxiv import parse_arxiv_id
from app.services.citation_graph_builder import build_citation_graph

router = APIRouter(tags=["citation_graph"])


@router.post("/trace_citation_graph", response_model=TraceCitationGraphResponse)
async def trace_citation_graph(body: TraceCitationGraphRequest):
    """Build a citation influence graph for a research paper.

    Accepts an arXiv ID (e.g. "2310.06825", "arxiv:2310.06825",
    or "https://arxiv.org/abs/2310.06825") and traces the most
    influential citations recursively using LLM-based influence
    ranking with web search grounding.
    """
    try:
        arxiv_id = parse_arxiv_id(body.arxiv_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    try:
        graph, config, attribution, title = await build_citation_graph(
            arxiv_id,
            max_depth=body.max_depth,
            max_citations=body.max_citations,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail="Failed to build citation graph: {}".format(str(exc)),
        )

    return TraceCitationGraphResponse(
        arxiv_id=arxiv_id,
        title=title,
        config=config,
        graph=graph,
        author_attribution=attribution,
    )
