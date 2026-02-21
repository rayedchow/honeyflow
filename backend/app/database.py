"""Async SQLAlchemy database engine/session management.

Designed for Neon Postgres with PgBouncer (transaction mode):
- NullPool: no client-side pooling — PgBouncer handles it
- prepare_threshold=None: disable prepared statements (incompatible with
  PgBouncer transaction mode)
- pool_pre_ping: survive Neon scale-to-zero reconnects
"""

import os
from contextlib import asynccontextmanager
from typing import AsyncIterator
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import orjson
import psycopg.types.json
from dotenv import load_dotenv
from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool

load_dotenv()

# Use orjson for all psycopg3 JSONB encode/decode (6-10x faster than stdlib json)
psycopg.types.json.set_json_dumps(lambda obj: orjson.dumps(obj).decode())
psycopg.types.json.set_json_loads(orjson.loads)

_RAW_DATABASE_URL = os.getenv("DATABASE_URL")
if not _RAW_DATABASE_URL:
    raise RuntimeError("DATABASE_URL is required")


def _to_async_database_url(url: str) -> str:
    if url.startswith("postgresql+psycopg://"):
        return url
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+psycopg://", 1)
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql+psycopg://", 1)
    return url


def _sanitize_database_url(url: str) -> str:
    """Strip Prisma-specific query args unsupported by SQLAlchemy drivers."""
    parsed = urlsplit(url)
    if not parsed.query:
        return url

    unsupported = {"pgbouncer", "pool_timeout", "connection_limit"}
    query = [(k, v) for k, v in parse_qsl(parsed.query, keep_blank_values=True) if k not in unsupported]
    return urlunsplit((parsed.scheme, parsed.netloc, parsed.path, urlencode(query, doseq=True), parsed.fragment))


DATABASE_URL = _sanitize_database_url(_to_async_database_url(_RAW_DATABASE_URL))

engine: AsyncEngine = create_async_engine(
    DATABASE_URL,
    poolclass=NullPool,
    pool_pre_ping=True,
    connect_args={
        "prepare_threshold": None,
        "connect_timeout": 30,
    },
)

SessionLocal = async_sessionmaker(
    bind=engine,
    expire_on_commit=False,
    class_=AsyncSession,
)


@asynccontextmanager
async def get_session() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        yield session


@asynccontextmanager
async def session_scope() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def check_connection() -> None:
    async with engine.connect() as conn:
        await conn.execute(text("SELECT 1"))


async def close_engine() -> None:
    await engine.dispose()
