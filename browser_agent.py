import os
import asyncio
import random
from playwright.async_api import async_playwright
from playwright_stealth import Stealth
from humanize import rnd, human_scroll, mouse_wiggle
from config import BROWSERLESS_TOKEN, IG_USER, IG_PASS

# Initialize stealth configuration
stealth = Stealth()


async def new_page():
    pw = await async_playwright().start()
    browser = await pw.chromium.connect_over_cdp(
        f"wss://chrome.browserless.io?token={BROWSERLESS_TOKEN}"
    )
    ctx = await browser.new_context(
        viewport={"width": 1440, "height": 900},
        user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    )
    page = await ctx.new_page()
    await stealth.apply_stealth_async(page)
    return page, ctx, pw


async def login(page):
    await page.goto("https://instagram.com")
    await rnd(4, 8)
    await page.fill('input[name="username"]', IG_USER)
    await page.fill('input[name="password"]', IG_PASS)
    await page.click('button[type="submit"]')
    await rnd(8, 12)
    # skip save info / notifications
    for text in ["Not Now", "Turn On", "Cancel"]:
        try:
            await page.click(f'button:has-text("{text}")', timeout=5000)
            await rnd()
        except:
            pass

