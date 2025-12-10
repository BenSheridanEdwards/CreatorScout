import asyncio
from types import SimpleNamespace

from pyppeteer import launch, connect
from pyppeteer_stealth import stealth

from humanize import rnd, human_scroll, mouse_wiggle
from config import BROWSERLESS_TOKEN, IG_USER, IG_PASS, LOCAL_BROWSER


async def _augment_page(page):
    """Add Playwright-like helpers to a pyppeteer page."""
    async def query_selector(selector: str):
        handle = await page.querySelector(selector)
        return ElementShim(handle) if handle else None

    async def query_selector_all(selector: str):
        handles = await page.querySelectorAll(selector)
        return [ElementShim(h) for h in handles]

    async def wait_for_selector(selector: str, timeout: int = 30000):
        handle = await page.waitForSelector(selector, {"timeout": timeout})
        return ElementShim(handle) if handle else None

    async def go_back():
        return await page.goBack()

    page.query_selector = query_selector
    page.query_selector_all = query_selector_all
    page.wait_for_selector = wait_for_selector
    page.go_back = go_back
    return page


class ElementShim:
    """Wrap a pyppeteer element handle with Playwright-like helpers."""

    def __init__(self, handle):
        self.handle = handle

    async def inner_text(self):
        prop = await self.handle.getProperty("innerText")
        return await prop.jsonValue()

    async def get_attribute(self, name: str):
        return await self.handle.evaluate(
            "(el, attr) => el.getAttribute(attr)", name
        )

    async def click(self, *args, **kwargs):
        return await self.handle.click(*args, **kwargs)

    async def screenshot(self, *args, **kwargs):
        return await self.handle.screenshot(*args, **kwargs)

    def __getattr__(self, item):
        return getattr(self.handle, item)


async def new_page():
    """
    Create a new Puppeteer (pyppeteer) page.

    - FAST/LOCAL mode uses local Chromium for lower latency.
    - Default uses Browserless (remote CDP).
    """
    if LOCAL_BROWSER:
        browser = await launch(
            headless=True,
            args=[
                "--no-sandbox",
                "--disable-dev-shm-usage",
            ],
        )
    else:
        browser = await connect(
            {"browserWSEndpoint": f"wss://chrome.browserless.io?token={BROWSERLESS_TOKEN}"}
        )

    page = await browser.newPage()
    await page.setViewport({"width": 1440, "height": 900})
    await page.setUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    )
    await stealth(page)
    await _augment_page(page)
    return page, browser, None


async def login(page):
    await page.goto("https://instagram.com")
    await rnd(1.5, 3.5)
    await page.type('input[name="username"]', IG_USER)
    await page.type('input[name="password"]', IG_PASS)
    await page.click('button[type="submit"]')
    await rnd(4, 7)
    # skip save info / notifications
    for text in ["Not Now", "Turn On", "Cancel"]:
        try:
            btn = await page.querySelector(f'button:contains("{text}")')
            if btn:
                await btn.click()
                await rnd()
        except:
            pass

