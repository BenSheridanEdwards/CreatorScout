import os
from datetime import datetime


def ensure_screenshots_dir():
    """Ensure the screenshots directory exists."""
    os.makedirs("screenshots", exist_ok=True)


def save_screenshot(page, prefix: str = "screenshot") -> str:
    """Save a screenshot and return the path."""
    ensure_screenshots_dir()
    timestamp = int(datetime.now().timestamp())
    path = f"screenshots/{prefix}_{timestamp}.png"
    return path


def sanitize_username(username: str) -> str:
    """Clean up a username (remove @, whitespace, etc.)."""
    return username.strip().lstrip("@").lower()


def is_valid_username(username: str) -> bool:
    """Check if a username looks valid."""
    clean = sanitize_username(username)
    if not clean:
        return False
    if len(clean) > 30:
        return False
    # Instagram usernames can only contain letters, numbers, periods, and underscores
    import re
    return bool(re.match(r'^[a-zA-Z0-9_.]+$', clean))


def format_timestamp(dt: datetime = None) -> str:
    """Format a datetime for logging."""
    if dt is None:
        dt = datetime.now()
    return dt.strftime("%Y-%m-%d %H:%M:%S")


def log(message: str, level: str = "INFO"):
    """Simple logging helper."""
    timestamp = format_timestamp()
    print(f"[{timestamp}] [{level}] {message}")
