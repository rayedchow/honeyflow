"""Playwright-based screenshot service for project cover images."""

import asyncio
import logging
from pathlib import Path
from typing import Optional

from playwright.async_api import Browser, Playwright, async_playwright

logger = logging.getLogger(__name__)

# Directory where cover images are stored
COVERS_DIR = Path(__file__).resolve().parent.parent.parent / "static" / "covers"

# Viewport for OG-compatible images
VIEWPORT_WIDTH = 1200
VIEWPORT_HEIGHT = 630

# Module-level singleton
_playwright: Optional[Playwright] = None
_browser: Optional[Browser] = None
_lock = asyncio.Lock()


async def _get_browser() -> Browser:
    """Return (or create) a shared Chromium browser instance."""
    global _playwright, _browser
    async with _lock:
        if _browser is None or not _browser.is_connected():
            _playwright = await async_playwright().start()
            _browser = await _playwright.chromium.launch(
                headless=True,
                args=[
                    "--disable-gpu",
                    "--disable-dev-shm-usage",
                    "--disable-extensions",
                ],
            )
            logger.info("Playwright browser launched")
    return _browser


async def close_browser() -> None:
    """Shut down the shared browser. Call during app shutdown."""
    global _playwright, _browser
    async with _lock:
        if _browser:
            await _browser.close()
            _browser = None
        if _playwright:
            await _playwright.stop()
            _playwright = None
    logger.info("Playwright browser closed")


async def take_project_screenshot(slug: str, source_url: str) -> Optional[str]:
    """Navigate to the project's source URL, screenshot the page.

    Returns the URL path (e.g. "/static/covers/{slug}.png") on success,
    or None on failure.
    """
    COVERS_DIR.mkdir(parents=True, exist_ok=True)
    output_path = COVERS_DIR / "{}.png".format(slug)

    try:
        browser = await _get_browser()
        context = await browser.new_context(
            viewport={"width": VIEWPORT_WIDTH, "height": VIEWPORT_HEIGHT},
            device_scale_factor=2,
        )
        page = await context.new_page()

        try:
            # Use domcontentloaded instead of networkidle — sites like
            # GitHub have continuous background requests that prevent
            # networkidle from ever firing within the timeout.
            await page.goto(source_url, wait_until="domcontentloaded", timeout=45000)

            # Give JS-rendered content time to paint
            await page.wait_for_timeout(3000)

            await page.screenshot(path=str(output_path), type="png")
            logger.info("Screenshot saved: %s", output_path)

            return "/static/covers/{}.png".format(slug)

        finally:
            await context.close()

    except Exception as exc:
        logger.warning("Screenshot failed for %s: %s", slug, exc)
        return None
