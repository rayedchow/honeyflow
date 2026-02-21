"""One-time migration: read existing cover PNGs from disk and store in DB.

Usage:
    cd backend && python -m scripts.migrate_covers_to_db
"""

import asyncio
import logging
from pathlib import Path

from sqlalchemy import select

from app.database import session_scope
from app.models.project import Project

logging.basicConfig(level=logging.INFO, format="%(message)s")
log = logging.getLogger(__name__)

COVERS_DIR = Path(__file__).resolve().parent.parent / "static" / "covers"


async def main() -> None:
    if not COVERS_DIR.exists():
        log.info("No covers directory found at %s — nothing to migrate.", COVERS_DIR)
        return

    pngs = list(COVERS_DIR.glob("*.png"))
    if not pngs:
        log.info("No PNG files found in %s", COVERS_DIR)
        return

    log.info("Found %d PNG files to migrate.", len(pngs))

    for png_path in pngs:
        slug = png_path.stem
        png_bytes = png_path.read_bytes()

        async with session_scope() as session:
            project = await session.scalar(
                select(Project).where(Project.slug == slug)
            )
            if not project:
                log.warning("  SKIP %s — no matching project in DB", slug)
                continue

            project.cover_image_data = png_bytes
            project.cover_image_url = f"/projects/{slug}/cover"
            log.info("  OK   %s — %d bytes", slug, len(png_bytes))

    log.info("Migration complete.")


if __name__ == "__main__":
    asyncio.run(main())
