"""Badge catalog and on-the-fly computation from existing data.

Badges are *not* read from the database here — they are derived from
project attribution, donation records, jury votes, and community feedback
so profiles can show them immediately.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.donation import Donation
from app.models.edge_vote import EdgeVote

# ---------------------------------------------------------------------------
# Badge catalog
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class BadgeDef:
    key: str
    name: str
    category: str          # contributor | philanthropist | juror | community
    description: str
    tier: int              # 1 = bronze, 2 = silver, 3 = gold


BADGE_CATALOG: list[BadgeDef] = [
    # ── Contributor ──────────────────────────────────────────────────────
    BadgeDef("seedling",       "Seedling",        "contributor",    "Contributed to your first project",          1),
    BadgeDef("pollinator",     "Pollinator",      "contributor",    "Contributed to 3 or more projects",          2),
    BadgeDef("hive_architect", "Hive Architect",  "contributor",    "Contributed to 5 or more projects",          3),
    BadgeDef("queen_bee",      "Queen Bee",       "contributor",    "Hold over 30% share in a project",           3),

    # ── Philanthropist ──────────────────────────────────────────────────
    BadgeDef("first_nectar",   "First Nectar",    "philanthropist", "Made your first donation",                   1),
    BadgeDef("honey_pot",      "Honey Pot",       "philanthropist", "Donated to 3 or more projects",              2),
    BadgeDef("golden_flow",    "Golden Flow",     "philanthropist", "Donated 1 ETH or more in total",             3),
    BadgeDef("benefactor",     "Benefactor",      "philanthropist", "Donated 10 ETH or more in total",            3),

    # ── Juror ───────────────────────────────────────────────────────────
    BadgeDef("first_verdict",  "First Verdict",   "juror",          "Cast your first jury vote",                  1),
    BadgeDef("wise_bee",       "Wise Bee",        "juror",          "Cast 10 or more jury votes",                 2),
    BadgeDef("oracle",         "The Oracle",      "juror",          "Cast 50 or more jury votes",                 3),

    # ── Community ───────────────────────────────────────────────────────
    BadgeDef("voice",          "Voice Heard",     "community",      "Submitted your first community feedback",    1),
    BadgeDef("megaphone",      "Megaphone",       "community",      "Submitted 5 or more community feedbacks",    2),
    BadgeDef("beacon",         "Community Beacon", "community",     "Submitted 20 or more community feedbacks",   3),
]

BADGE_MAP: dict[str, BadgeDef] = {b.key: b for b in BADGE_CATALOG}


# ---------------------------------------------------------------------------
# Compute earned badges
# ---------------------------------------------------------------------------

def _contributor_badges(
    project_count: int,
    max_pct: float,
) -> list[str]:
    earned: list[str] = []
    if project_count >= 1:
        earned.append("seedling")
    if project_count >= 3:
        earned.append("pollinator")
    if project_count >= 5:
        earned.append("hive_architect")
    if max_pct > 30:
        earned.append("queen_bee")
    return earned


async def _philanthropist_badges(
    session: AsyncSession,
    wallet_address: str,
) -> list[str]:
    earned: list[str] = []
    rows = (
        await session.execute(
            select(
                func.count(func.distinct(Donation.project_id)).label("projects"),
                func.coalesce(func.sum(Donation.amount_eth), 0.0).label("total_eth"),
            ).where(func.lower(Donation.donator_address) == wallet_address.lower())
        )
    ).one()

    projects: int = rows.projects  # type: ignore[attr-defined]
    total_eth: float = float(rows.total_eth)  # type: ignore[attr-defined]

    if projects >= 1:
        earned.append("first_nectar")
    if projects >= 3:
        earned.append("honey_pot")
    if total_eth >= 1.0:
        earned.append("golden_flow")
    if total_eth >= 10.0:
        earned.append("benefactor")
    return earned


async def _juror_badges(
    session: AsyncSession,
    wallet_address: str,
) -> list[str]:
    earned: list[str] = []
    row = (
        await session.execute(
            select(
                func.count(EdgeVote.id).label("votes"),
            ).where(func.lower(EdgeVote.wallet_address) == wallet_address.lower())
        )
    ).one()

    votes: int = row.votes  # type: ignore[attr-defined]

    if votes >= 1:
        earned.append("first_verdict")
    if votes >= 10:
        earned.append("wise_bee")
    if votes >= 50:
        earned.append("oracle")
    return earned


async def compute_badges(
    session: AsyncSession,
    *,
    project_count: int,
    max_pct: float,
    wallet_address: str | None = None,
) -> list[dict[str, Any]]:
    """Return the full badge catalog annotated with earned status."""
    earned_keys: set[str] = set()

    earned_keys.update(_contributor_badges(project_count, max_pct))

    if wallet_address:
        earned_keys.update(await _philanthropist_badges(session, wallet_address))
        earned_keys.update(await _juror_badges(session, wallet_address))

    result: list[dict[str, Any]] = []
    for b in BADGE_CATALOG:
        result.append({
            "key": b.key,
            "name": b.name,
            "category": b.category,
            "description": b.description,
            "tier": b.tier,
            "earned": b.key in earned_keys,
        })
    return result
