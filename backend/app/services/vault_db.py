"""PostgreSQL persistence for project vault wallets.

Stores the mapping of project_id -> Privy wallet (id + address)
using the shared Neon database via SQLAlchemy.
"""

import logging
from typing import Optional, Tuple

from sqlalchemy import Column, DateTime, String, Table, func, select, text
from sqlalchemy.ext.asyncio import AsyncEngine

from app.database import engine, SessionLocal
from app.models.base import Base

logger = logging.getLogger(__name__)

project_vaults = Table(
    "project_vaults",
    Base.metadata,
    Column("project_id", String, primary_key=True),
    Column("wallet_id", String, nullable=False),
    Column("address", String, nullable=False),
    Column("created_at", DateTime(timezone=True), nullable=False, server_default=func.now()),
    extend_existing=True,
)


async def init_db() -> None:
    """Create the project_vaults table if it doesn't exist."""
    logger.info("[VAULT_DB] Ensuring project_vaults table exists in Neon")
    async with engine.begin() as conn:
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS project_vaults (
                project_id   TEXT PRIMARY KEY,
                wallet_id    TEXT NOT NULL,
                address      TEXT NOT NULL,
                created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
            );
        """))
    logger.info("[VAULT_DB] Table ready")


async def get_vault(project_id: str) -> Optional[Tuple[str, str]]:
    """Look up a vault by project_id.

    Returns (wallet_id, address) or None if not found.
    """
    async with SessionLocal() as session:
        result = await session.execute(
            select(project_vaults.c.wallet_id, project_vaults.c.address).where(
                project_vaults.c.project_id == project_id
            )
        )
        row = result.first()
    if row:
        logger.info("[VAULT_DB] Found vault for %s: %s", project_id, row[1])
        return (row[0], row[1])
    logger.info("[VAULT_DB] No vault found for %s", project_id)
    return None


async def get_vault_by_address(address: str) -> Optional[Tuple[str, str]]:
    """Look up a vault by its on-chain address.

    Returns (wallet_id, project_id) or None if not found.
    """
    async with SessionLocal() as session:
        result = await session.execute(
            select(project_vaults.c.wallet_id, project_vaults.c.project_id).where(
                func.lower(project_vaults.c.address) == address.lower()
            )
        )
        row = result.first()
    if row:
        return (row[0], row[1])
    return None


async def create_vault(project_id: str, wallet_id: str, address: str) -> None:
    """Insert a new vault record."""
    async with SessionLocal() as session:
        await session.execute(
            project_vaults.insert().values(
                project_id=project_id,
                wallet_id=wallet_id,
                address=address,
            )
        )
        await session.commit()
    logger.info("[VAULT_DB] Created vault for %s: wallet=%s address=%s", project_id, wallet_id, address)
