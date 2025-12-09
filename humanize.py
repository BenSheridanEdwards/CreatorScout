import random
import asyncio


async def rnd(min_sec=0.7, max_sec=2.4):
    await asyncio.sleep(random.uniform(min_sec, max_sec))


async def human_scroll(page, times=None):
    if times is None:
        times = random.randint(3, 6)
    for _ in range(times):
        await page.evaluate(f"window.scrollBy(0, {random.randint(400,900)})")
        await rnd(0.3, 1.1)


async def mouse_wiggle(page):
    await page.mouse.move(
        random.randint(200, 1600), 
        random.randint(200, 900), 
        steps=random.randint(15, 35)
    )

