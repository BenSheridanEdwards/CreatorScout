import random
import asyncio

from config import (
    DELAY_SCALE,
    DELAY_SCALES,
    DELAYS,
    DELAY_CATEGORIES,
    TIMEOUTS,
    TIMEOUT_SCALE,
    SLEEP_SCALE,  # Legacy alias
)


# ═══════════════════════════════════════════════════════════════════════════════
# DELAY HELPERS
# ═══════════════════════════════════════════════════════════════════════════════

def get_delay(name: str) -> tuple[float, float]:
    """
    Get scaled delay bounds for a named action.
    
    Applies both global DELAY_SCALE and per-category DELAY_SCALES[category].
    
    Example:
        >>> get_delay("after_navigate")  # Returns scaled (min, max) tuple
        (0.4, 0.8)  # If DELAY_SCALE=0.2
    """
    base_min, base_max = DELAYS.get(name, (0.7, 2.4))
    category = DELAY_CATEGORIES.get(name, "input")
    category_scale = DELAY_SCALES.get(category, 1.0)
    
    # Apply both global and category scale
    total_scale = DELAY_SCALE * category_scale
    
    return (
        max(base_min * total_scale, 0.05),  # Floor 50ms
        max(base_max * total_scale, 0.1),   # Floor 100ms
    )


async def delay(name: str):
    """
    Sleep for a named delay from config.
    
    Example:
        await delay("after_navigate")
        await delay("between_profiles")
    """
    lo, hi = get_delay(name)
    await asyncio.sleep(random.uniform(lo, hi))


def _scaled_sleep_bounds(min_sec: float, max_sec: float) -> tuple[float, float]:
    """Scale sleep bounds by global DELAY_SCALE but keep a sane floor."""
    return (
        max(min_sec * DELAY_SCALE, 0.05),
        max(max_sec * DELAY_SCALE, 0.1),
    )


async def rnd(min_sec: float = 0.7, max_sec: float = 2.4):
    """
    Legacy random delay function - prefer delay(name) for new code.
    
    Still useful for one-off delays not in the config.
    """
    lo, hi = _scaled_sleep_bounds(min_sec, max_sec)
    await asyncio.sleep(random.uniform(lo, hi))


# ═══════════════════════════════════════════════════════════════════════════════
# TIMEOUT HELPERS
# ═══════════════════════════════════════════════════════════════════════════════

def get_timeout(name: str) -> int:
    """
    Get scaled timeout in milliseconds.
    
    Example:
        >>> get_timeout("element_modal")
        5000
        >>> # With TIMEOUT_SCALE=2.0
        >>> get_timeout("element_modal")
        10000
    """
    base = TIMEOUTS.get(name, 10000)
    return int(base * TIMEOUT_SCALE)


# ═══════════════════════════════════════════════════════════════════════════════
# HUMANIZATION BEHAVIORS
# ═══════════════════════════════════════════════════════════════════════════════

async def human_scroll(page, times: int | None = None):
    """Scroll the page like a human would."""
    if times is None:
        times = random.randint(2, 4) if DELAY_SCALE < 1 else random.randint(3, 6)
    for _ in range(times):
        await page.evaluate(f"window.scrollBy(0, {random.randint(300,700)})")
        await delay("after_scroll")


async def mouse_wiggle(page):
    """Move the mouse randomly to appear human."""
    await page.mouse.move(
        random.randint(200, 1600),
        random.randint(200, 900),
        steps=random.randint(8, 20) if DELAY_SCALE < 1 else random.randint(15, 35),
    )

