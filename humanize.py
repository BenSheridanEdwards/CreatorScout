import random
import asyncio

from config import SLEEP_SCALE


def _scaled_sleep_bounds(min_sec: float, max_sec: float) -> tuple[float, float]:
    """Scale sleep bounds by global SLEEP_SCALE but keep a sane floor."""
    return (
        max(min_sec * SLEEP_SCALE, 0.05),
        max(max_sec * SLEEP_SCALE, 0.1),
    )


async def rnd(min_sec: float = 0.7, max_sec: float = 2.4):
    lo, hi = _scaled_sleep_bounds(min_sec, max_sec)
    await asyncio.sleep(random.uniform(lo, hi))


async def human_scroll(page, times: int | None = None):
    if times is None:
        times = random.randint(2, 4) if SLEEP_SCALE < 1 else random.randint(3, 6)
    for _ in range(times):
        await page.evaluate(f"window.scrollBy(0, {random.randint(300,700)})")
        await rnd(0.15, 0.6)


async def mouse_wiggle(page):
    await page.mouse.move(
        random.randint(200, 1600),
        random.randint(200, 900),
        steps=random.randint(8, 20) if SLEEP_SCALE < 1 else random.randint(15, 35),
    )

