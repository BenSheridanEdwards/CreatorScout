import os
import datetime


async def save_proof(username: str, page):
    """Save a proof screenshot of the DM sent."""
    os.makedirs("screenshots", exist_ok=True)
    ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    path = f"screenshots/DM_{username}_{ts}.png"
    await page.screenshot(path=path, full_page=True)
    return path

