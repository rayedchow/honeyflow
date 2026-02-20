from fastapi import APIRouter, HTTPException
from httpx import HTTPStatusError

from app.schemas.package_graph import TracePackageRequest, TracePackageResponse
from app.services.package_graph_builder import build_package_graph

router = APIRouter(tags=["package_graph"])


@router.post("/trace_package", response_model=TracePackageResponse)
async def trace_package(body: TracePackageRequest):
    """Build a full contribution attribution graph for an npm or PyPI package.

    Traces direct code contributors, package dependencies, and transitive
    dependencies recursively up to the configured depth.
    """
    package_name = body.package_name.strip()
    ecosystem = body.ecosystem.value

    if not package_name:
        raise HTTPException(status_code=400, detail="package_name must not be empty")

    try:
        graph, config, attribution = await build_package_graph(
            package_name,
            ecosystem,
            max_depth=body.max_depth,
            max_children=body.max_children,
        )
    except HTTPStatusError as exc:
        status = exc.response.status_code
        if status == 404:
            raise HTTPException(
                status_code=404,
                detail="Package '{}' not found on {}".format(package_name, ecosystem),
            )
        raise HTTPException(
            status_code=502,
            detail="{} registry returned {}".format(ecosystem, status),
        )

    return TracePackageResponse(
        package=package_name,
        ecosystem=ecosystem,
        config=config,
        graph=graph,
        user_attribution=attribution,
    )
