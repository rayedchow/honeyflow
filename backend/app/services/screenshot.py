"""Playwright-based screenshot service for project cover images."""

import asyncio
import logging
from typing import Optional

from playwright.async_api import Browser, Playwright, async_playwright

logger = logging.getLogger(__name__)

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


async def take_project_screenshot(source_url: str) -> Optional[bytes]:
    """Navigate to the project's source URL, screenshot the page.

    Returns raw PNG bytes on success, or None on failure.
    """
    try:
        browser = await _get_browser()
        context = await browser.new_context(
            viewport={"width": VIEWPORT_WIDTH, "height": VIEWPORT_HEIGHT},
            device_scale_factor=2,
        )
        page = await context.new_page()

        try:
            await page.goto(source_url, wait_until="domcontentloaded", timeout=45000)
            await page.wait_for_timeout(3000)

            png_bytes = await page.screenshot(type="png")
            logger.info("Screenshot captured for %s (%d bytes)", source_url, len(png_bytes))
            return png_bytes

        finally:
            await context.close()

    except Exception as exc:
        logger.warning("Screenshot failed for %s: %s", source_url, exc)
        return None
