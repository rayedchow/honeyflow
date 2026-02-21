import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, func as sqlfunc

from app.database import get_session
from app.models.edge_vote import EdgeVote
from app.models.project import Project
from app.services.badges import compute_badges
from app.services.donation_db import get_donation_totals
from app.services.privy import send_from_vault
from app.services.vault_db import get_vault
from app.services.withdrawal_db import get_total_withdrawn, insert_withdrawal

logger = logging.getLogger(__name__)

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

            tc_match = next(
                (
                    c
                    for c in top_contributors
                    if c.get("name", "").lower() == username.lower()
                ),
                None,
            )
            if tc_match:
                raw = tc_match.get("percentage", "0%").replace("%", "")
                try:
                    pct = float(raw)
                except ValueError:
                    pct = None

            if pct is None and attribution:
                match_key = next(
                    (k for k in attribution if k.lower() == username.lower()), None
                )
                if match_key is not None:
                    total_weight = sum(attribution.values()) or 1.0
                    pct = (attribution[match_key] / total_weight) * 100

            if pct is None:
                continue

            if pct > max_pct:
                max_pct = pct

            totals = await get_donation_totals(p.slug)
            raised_eth = totals["total_eth"]
            raised_usd = raised_eth * eth_to_usd
            share_eth = raised_eth * (pct / 100)
            share_usd = raised_usd * (pct / 100)

            total_attributed_usd += share_usd
            total_attributed_eth += share_eth

            contributed_projects.append(
                {
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
                }
            )

        if not contributed_projects:
            raise HTTPException(
                status_code=404, detail="Contributor not found in any project"
            )

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


@router.get("/{username}/earnings")
async def get_user_earnings(username: str, wallet: str | None = None):
    """Calculate unclaimed earnings from contributions and jury rewards."""
    eth_to_usd = 2000

    async with get_session() as session:
        projects = (
            (await session.execute(select(Project).order_by(Project.created_at.desc())))
            .scalars()
            .all()
        )

        contribution_eth = 0.0
        project_breakdown: list[dict] = []

        for p in projects:
            attribution: dict = p.attribution or {}
            top_contributors: list[dict] = p.top_contributors or []

            pct: float | None = None
            tc_match = next(
                (
                    c
                    for c in top_contributors
                    if c.get("name", "").lower() == username.lower()
                ),
                None,
            )
            if tc_match:
                raw = tc_match.get("percentage", "0%").replace("%", "")
                try:
                    pct = float(raw)
                except ValueError:
                    pct = None

            if pct is None and attribution:
                match_key = next(
                    (k for k in attribution if k.lower() == username.lower()), None
                )
                if match_key is not None:
                    total_weight = sum(attribution.values()) or 1.0
                    pct = (attribution[match_key] / total_weight) * 100

            if pct is None:
                continue

            totals = await get_donation_totals(p.slug)
            raised_eth = totals["total_eth"]
            share_eth = raised_eth * (pct / 100)
            contribution_eth += share_eth

            project_breakdown.append(
                {
                    "slug": p.slug,
                    "name": p.name,
                    "share_eth": round(share_eth, 6),
                    "percentage": round(pct, 2),
                }
            )

        juror_eth = 0.0
        if wallet:
            result = await session.execute(
                select(sqlfunc.sum(0.0001 * (0.5 + (EdgeVote.confidence * 0.5)))).where(
                    EdgeVote.wallet_address == wallet.strip().lower()
                )
            )
            row = result.scalar()
            juror_eth = float(row) if row else 0.0

    withdrawn_eth = await get_total_withdrawn(username)
    total_eth = contribution_eth + juror_eth
    unclaimed_eth = max(0.0, total_eth - withdrawn_eth)

    return {
        "username": username,
        "contribution_eth": round(contribution_eth, 6),
        "juror_eth": round(juror_eth, 6),
        "total_eth": round(total_eth, 6),
        "withdrawn_eth": round(withdrawn_eth, 6),
        "unclaimed_eth": round(unclaimed_eth, 6),
        "unclaimed_usd": round(unclaimed_eth * eth_to_usd, 2),
        "projects": project_breakdown,
    }


class WithdrawRequest(BaseModel):
    to_address: str


@router.post("/{username}/withdraw")
async def withdraw_earnings(username: str, body: WithdrawRequest):
    """Withdraw unclaimed contribution earnings to a wallet address.

    Disburses proportionally from each project vault where the user
    has attribution. Privy signs the transactions server-side.
    """
    earnings = await get_user_earnings(username)
    unclaimed = earnings["unclaimed_eth"]
    if unclaimed <= 0:
        raise HTTPException(status_code=400, detail="No unclaimed earnings")

    disbursed: list[dict] = []
    total_claimed = 0.0

    for proj in earnings["projects"]:
        share = proj["share_eth"]
        if share <= 0:
            continue

        tx_hash = None
        vault = await get_vault(proj["slug"])
        if vault:
            wallet_id, _ = vault
            try:
                result = await send_from_vault(
                    wallet_id=wallet_id,
                    to_address=body.to_address,
                    amount_eth=share,
                )
                tx_hash = result.get("hash")
            except Exception as exc:
                logger.warning(
                    "[WITHDRAW] Vault disburse failed for %s (will still record claim): %s",
                    proj["slug"],
                    exc,
                )

        await insert_withdrawal(
            username=username,
            wallet_address=body.to_address,
            amount_eth=share,
            source="contribution",
            project_slug=proj["slug"],
            tx_hash=tx_hash,
        )
        total_claimed += share
        disbursed.append(
            {
                "project": proj["slug"],
                "amount_eth": share,
                "tx_hash": tx_hash,
            }
        )

    if earnings["juror_eth"] > 0:
        await insert_withdrawal(
            username=username,
            wallet_address=body.to_address,
            amount_eth=earnings["juror_eth"],
            source="juror",
        )
        total_claimed += earnings["juror_eth"]

    return {
        "username": username,
        "total_withdrawn_eth": round(total_claimed, 6),
        "disbursements": disbursed,
    }
