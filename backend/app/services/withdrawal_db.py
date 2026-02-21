"""PostgreSQL persistence for withdrawal records."""

import logging
from typing import Optional

from sqlalchemy import text

from app.database import engine, SessionLocal

logger = logging.getLogger(__name__)


async def init_withdrawals_db() -> None:
    """Create the withdrawals table if it doesn't exist."""
    logger.info("[WITHDRAWAL_DB] Ensuring withdrawals table exists")
    async with engine.begin() as conn:
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS withdrawals (
                id              SERIAL PRIMARY KEY,
                username        TEXT NOT NULL,
                wallet_address  TEXT NOT NULL,
                amount_eth      DOUBLE PRECISION NOT NULL,
                source          TEXT NOT NULL,
                project_slug    TEXT,
                tx_hash         TEXT,
                created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
            );
        """))
        await conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_withdrawals_username
            ON withdrawals (username);
        """))
    logger.info("[WITHDRAWAL_DB] Table ready")


async def insert_withdrawal(
    username: str,
    wallet_address: str,
    amount_eth: float,
    source: str,
    project_slug: Optional[str] = None,
    tx_hash: Optional[str] = None,
) -> None:
    async with SessionLocal() as session:
        await session.execute(
            text("""
                INSERT INTO withdrawals (username, wallet_address, amount_eth, source, project_slug, tx_hash)
                VALUES (:username, :wallet_address, :amount_eth, :source, :project_slug, :tx_hash)
            """),
            {
                "username": username,
                "wallet_address": wallet_address,
                "amount_eth": amount_eth,
                "source": source,
                "project_slug": project_slug,
                "tx_hash": tx_hash,
            },
        )
        await session.commit()
    logger.info(
        "[WITHDRAWAL_DB] Inserted withdrawal: user=%s amount=%s source=%s",
        username, amount_eth, source,
    )


async def get_total_withdrawn(username: str) -> float:
    """Total ETH withdrawn by a user."""
    async with SessionLocal() as session:
        result = await session.execute(
            text("SELECT COALESCE(SUM(amount_eth), 0) FROM withdrawals WHERE username = :username"),
            {"username": username},
        )
        row = result.first()
    return float(row[0]) if row else 0.0


async def get_withdrawals(username: str) -> list[dict]:
    async with SessionLocal() as session:
        result = await session.execute(
            text("""
                SELECT id, username, wallet_address, amount_eth, source, project_slug, tx_hash, created_at
                FROM withdrawals
                WHERE username = :username
                ORDER BY created_at DESC
            """),
            {"username": username},
        )
        rows = result.fetchall()
    return [
        {
            "id": row[0],
            "username": row[1],
            "wallet_address": row[2],
            "amount_eth": row[3],
            "source": row[4],
            "project_slug": row[5],
            "tx_hash": row[6],
            "created_at": row[7].isoformat() if row[7] else None,
        }
        for row in rows
    ]
