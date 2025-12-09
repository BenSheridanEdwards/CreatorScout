import random
import asyncio


async def random_delay(min_sec=0.6, max_sec=2.2):
    """Add a random delay to simulate human behavior."""
    delay = random.uniform(min_sec, max_sec)
    await asyncio.sleep(delay)


async def human_scroll(page, times=3):
    """Scroll the page like a human would."""
    for _ in range(times):
        dist = random.randint(400, 800)
        await page.evaluate(f"window.scrollBy(0, {dist})")
        await random_delay(0.3, 1.0)


async def human_mouse_move(page):
    """Move the mouse randomly like a human would."""
    x = random.randint(100, 1000)
    y = random.randint(100, 900)
    await page.mouse.move(x, y, steps=random.randint(10, 25))


async def human_type(page, selector: str, text: str):
    """Type text like a human with random delays between keystrokes."""
    element = await page.query_selector(selector)
    if element:
        for char in text:
            await element.type(char, delay=random.randint(50, 150))
            if random.random() < 0.1:  # 10% chance of small pause
                await random_delay(0.1, 0.3)
