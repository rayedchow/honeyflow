from fastapi import APIRouter, HTTPException
from sqlalchemy import or_, select

from app.database import get_session, session_scope
from app.models.project import Project

router = APIRouter(prefix="/projects", tags=["projects"])


def _to_dict(project: Project) -> dict:
    return {
        "id": project.id,
        "slug": project.slug,
        "name": project.name,
        "category": project.category,
        "type": project.type,
        "summary": project.summary,
        "description": project.description,
        "source_url": project.source_url,
        "raised": project.raised,
        "contributors": project.contributors,
        "depth": project.depth,
        "graph_data": project.graph_data,
        "attribution": project.attribution,
        "dependencies": project.dependencies,
        "top_contributors": project.top_contributors,
        "cover_image_url": project.cover_image_url,
        "created_at": project.created_at,
        "updated_at": project.updated_at,
    }


@router.get("")
async def list_projects(search: str = ""):
    async with get_session() as session:
        stmt = select(Project)
        if search:
            pattern = "%{}%".format(search)
            stmt = stmt.where(
                or_(
                    Project.name.ilike(pattern),
                    Project.category.ilike(pattern),
                    Project.summary.ilike(pattern),
                )
            )
        stmt = stmt.order_by(Project.created_at.desc())
        projects = (await session.execute(stmt)).scalars().all()

    return {
        "projects": [_to_dict(p) for p in projects],
        "count": len(projects),
    }


@router.get("/{slug}")
async def get_project(slug: str):
    async with get_session() as session:
        stmt = select(Project).where(Project.slug == slug)
        project = (await session.execute(stmt)).scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return _to_dict(project)


@router.delete("/{slug}")
async def delete_project(slug: str):
    async with session_scope() as session:
        stmt = select(Project).where(Project.slug == slug)
        project = (await session.execute(stmt)).scalar_one_or_none()
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        await session.delete(project)
    return {"deleted": True, "slug": slug}
