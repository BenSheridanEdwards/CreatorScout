from dotenv import load_dotenv
import os

load_dotenv()


def _flag(name: str, default: bool = False) -> bool:
    """Convert env flag to bool."""
    val = os.getenv(name)
    if val is None:
        return default
    return str(val).strip().lower() in {"1", "true", "yes", "y", "on"}


# Feature flags / runtime tuning
FAST_MODE = _flag("FAST_MODE", default=False)
# Scale down sleeps when fast mode is on (lower = faster)
SLEEP_SCALE = 0.2 if FAST_MODE else 1.0
# Skip slow/paid vision calls when fast mode is on
SKIP_VISION = _flag("SKIP_VISION", default=FAST_MODE)
# Prefer local chromium instead of Browserless when fast mode is on
LOCAL_BROWSER = _flag("LOCAL_BROWSER", default=FAST_MODE)


BROWSERLESS_TOKEN      = os.getenv("BROWSERLESS_TOKEN")
OPENROUTER_API_KEY     = os.getenv("OPENROUTER_API_KEY")
IG_USER                = os.getenv("INSTAGRAM_USERNAME")
IG_PASS                = os.getenv("INSTAGRAM_PASSWORD")

# <<< BEST MODEL RIGHT NOW (Dec 2025) >>>
VISION_MODEL = "google/gemini-flash-1.5-exp"          # fastest + cheapest winner
# VISION_MODEL = "google/gemini-pro-vision-2.5"       # max accuracy if you want
# VISION_MODEL = "anthropic/claude-3-5-sonnet-20241022"

CONFIDENCE_THRESHOLD = 80
MAX_DMS_PER_DAY      = 120
DM_MESSAGE           = "Hey beautiful, loved your vibe — just followed you on OF too if you're there"  # change it

