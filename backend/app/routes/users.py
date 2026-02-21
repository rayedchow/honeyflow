from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from app.database import get_session
from app.models.project import Project
from app.services.badges import compute_badges

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/{username}")
async def get_user_profile(username: str, wallet: str | None = None):
    """Aggregate a contributor's profile across all projects."""
    async with get_session() as session:
        projects = (
            (await session.execute(select(Project).order_by(Project.created_at.desc())))
            .scalars()
            .all()
        )

        contributed_projects: list[dict] = []
        total_attributed_eth = 0.0
        total_attributed_usd = 0.0
        eth_to_usd = 2500
        max_pct = 0.0

        for p in projects:
            attribution: dict = p.attribution or {}
            top_contributors: list[dict] = p.top_contributors or []

            pct: float | None = None

            tc_match = next((c for c in top_contributors if c.get("name", "").lower() == username.lower()), None)
            if tc_match:
                raw = tc_match.get("percentage", "0%").replace("%", "")
                try:
                    pct = float(raw)
                except ValueError:
                    pct = None

            if pct is None and attribution:
                match_key = next((k for k in attribution if k.lower() == username.lower()), None)
                if match_key is not None:
                    total_weight = sum(attribution.values()) or 1.0
                    pct = (attribution[match_key] / total_weight) * 100

            if pct is None:
                continue

            if pct > max_pct:
                max_pct = pct

            raised_usd = float(p.raised) if p.raised else 0.0
            raised_eth = raised_usd / eth_to_usd if eth_to_usd else 0.0
            share_usd = raised_usd * (pct / 100)
            share_eth = raised_eth * (pct / 100)

            total_attributed_usd += share_usd
            total_attributed_eth += share_eth

            contributed_projects.append({
                "slug": p.slug,
                "name": p.name,
                "type": p.type,
                "category": p.category,
                "summary": p.summary,
                "source_url": p.source_url,
                "raised_usd": round(raised_usd, 2),
                "raised_eth": round(raised_eth, 4),
                "percentage": round(pct, 2),
                "share_usd": round(share_usd, 2),
                "share_eth": round(share_eth, 4),
                "contributors": p.contributors,
            })

        if not contributed_projects:
            raise HTTPException(status_code=404, detail="Contributor not found in any project")

        badges = await compute_badges(
            session,
            project_count=len(contributed_projects),
            max_pct=max_pct,
            wallet_address=wallet,
        )

    return {
        "username": username,
        "projects": contributed_projects,
        "total_projects": len(contributed_projects),
        "total_attributed_usd": round(total_attributed_usd, 2),
        "total_attributed_eth": round(total_attributed_eth, 4),
        "badges": badges,
    }
