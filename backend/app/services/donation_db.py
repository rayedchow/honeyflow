"""PostgreSQL persistence for per-donation records.

Stores individual donations with wallet addresses and amounts,
following the vault_db.py pattern (raw SQL CREATE TABLE IF NOT EXISTS).
"""

import logging
from typing import Optional

from sqlalchemy import text

from app.database import engine, SessionLocal

logger = logging.getLogger(__name__)


async def init_donations_db() -> None:
    """Create the donations table if it doesn't exist."""
    logger.info("[DONATION_DB] Ensuring donations table exists")
    async with engine.begin() as conn:
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS donations (
                id              SERIAL PRIMARY KEY,
                project_id      TEXT NOT NULL,
                donator_address TEXT NOT NULL,
                amount_eth      DOUBLE PRECISION NOT NULL,
                tx_hash         TEXT,
                created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
            );
        """))
        await conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_donations_project_id
            ON donations (project_id);
        """))
    logger.info("[DONATION_DB] Table ready")


async def insert_donation(
    project_id: str,
    donator_address: str,
    amount_eth: float,
    tx_hash: Optional[str] = None,
) -> None:
    """Insert a single donation record (skips if tx_hash already recorded)."""
    async with SessionLocal() as session:
        if tx_hash:
            dup = await session.execute(
                text("SELECT 1 FROM donations WHERE tx_hash = :tx_hash"),
                {"tx_hash": tx_hash},
            )
            if dup.first():
                logger.debug("[DONATION_DB] Skipped duplicate tx_hash=%s", tx_hash)
                return
        await session.execute(
            text("""
                INSERT INTO donations (project_id, donator_address, amount_eth, tx_hash)
                VALUES (:project_id, :donator_address, :amount_eth, :tx_hash)
            """),
            {
                "project_id": project_id,
                "donator_address": donator_address,
                "amount_eth": amount_eth,
                "tx_hash": tx_hash,
            },
        )
        await session.commit()
    logger.info(
        "[DONATION_DB] Inserted donation: project=%s addr=%s amount=%s",
        project_id, donator_address, amount_eth,
    )


async def get_donations(project_id: str) -> list[dict]:
    """Fetch all donations for a project, ordered by created_at desc."""
    async with SessionLocal() as session:
        result = await session.execute(
            text("""
                SELECT id, project_id, donator_address, amount_eth, tx_hash, created_at
                FROM donations
                WHERE project_id = :project_id
                ORDER BY created_at DESC
            """),
            {"project_id": project_id},
        )
        rows = result.fetchall()
    return [
        {
            "id": row[0],
            "project_id": row[1],
            "donator_address": row[2],
            "amount_eth": row[3],
            "tx_hash": row[4],
            "created_at": row[5].isoformat() if row[5] else None,
        }
        for row in rows
    ]


async def get_donation_totals(project_id: str) -> dict:
    """Returns {total_eth, count} for a project."""
    async with SessionLocal() as session:
        result = await session.execute(
            text("""
                SELECT COALESCE(SUM(amount_eth), 0), COUNT(*)
                FROM donations
                WHERE project_id = :project_id
            """),
            {"project_id": project_id},
        )
        row = result.first()
    return {
        "total_eth": float(row[0]) if row else 0.0,
        "count": int(row[1]) if row else 0,
    }


async def clear_seeded_donations() -> None:
    """Remove all seeded donations (those with tx_hash IS NULL)."""
    async with SessionLocal() as session:
        await session.execute(text("DELETE FROM donations WHERE tx_hash IS NULL"))
        await session.commit()
    logger.info("[DONATION_DB] Cleared seeded donations")
