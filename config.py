from dotenv import load_dotenv
import os

load_dotenv()


def _flag(name: str, default: bool = False) -> bool:
    """Convert env flag to bool."""
    val = os.getenv(name)
    if val is None:
        return default
    return str(val).strip().lower() in {"1", "true", "yes", "y", "on"}


def _float(name: str, default: float) -> float:
    """Get float from env with default."""
    val = os.getenv(name)
    if val is None:
        return default
    try:
        return float(val)
    except ValueError:
        return default


# Feature flags / runtime tuning
FAST_MODE = _flag("FAST_MODE", default=False)
# Skip slow/paid vision calls when fast mode is on
SKIP_VISION = _flag("SKIP_VISION", default=FAST_MODE)
# Prefer local chromium instead of Browserless when fast mode is on
LOCAL_BROWSER = _flag("LOCAL_BROWSER", default=FAST_MODE)


# ═══════════════════════════════════════════════════════════════════════════════
# DELAYS - Intentional waits for humanization & rate limiting
# ═══════════════════════════════════════════════════════════════════════════════

# Global multiplier (0.0 = instant, 1.0 = normal, 2.0 = extra cautious)
# FAST_MODE sets this to 0.2 by default
DELAY_SCALE = _float("DELAY_SCALE", 0.2 if FAST_MODE else 1.0)

# Legacy alias for backwards compatibility
SLEEP_SCALE = DELAY_SCALE

# Per-category multipliers (stacks with DELAY_SCALE)
# Example: DELAY_SCALE=0.5 + DELAY_SCALE_ACTION=2.0 = 1.0x for actions
DELAY_SCALES = {
    "navigation": _float("DELAY_SCALE_NAV", 1.0),
    "modal": _float("DELAY_SCALE_MODAL", 1.0),
    "input": _float("DELAY_SCALE_INPUT", 1.0),       # typing, clicking
    "action": _float("DELAY_SCALE_ACTION", 1.0),     # DM, follow (higher risk)
    "pacing": _float("DELAY_SCALE_PACING", 1.0),     # between items
}

# Base delay values (min, max) in seconds - before scaling
DELAYS = {
    # Navigation
    "after_navigate": (2, 4),
    "after_go_back": (2, 3),
    
    # Modal
    "after_modal_open": (2, 4),
    "after_modal_close": (1, 2),
    "after_scroll": (0.5, 1.5),
    "after_scroll_batch": (2, 4),
    
    # Input/Interaction
    "after_click": (0.5, 1.5),
    "after_type": (0.3, 0.8),
    "after_linktree_click": (3, 5),
    "mouse_wiggle": (0.7, 2.4),
    
    # Actions (higher risk - should be slower)
    "after_message_open": (2, 4),
    "after_dm_type": (1, 2),
    "after_dm_send": (2, 4),
    "after_follow": (1, 2),
    
    # Pacing
    "between_profiles": (2, 6),
    "between_seeds": (60, 180),
    "queue_empty": (300, 300),  # Fixed 5 min wait
    
    # Login
    "after_credentials": (1.5, 3.5),
    "after_login_submit": (4, 7),
    "after_popup_dismiss": (0.7, 2.4),
}

# Category mapping - which scale applies to which delay
DELAY_CATEGORIES = {
    # Navigation
    "after_navigate": "navigation",
    "after_go_back": "navigation",
    "after_linktree_click": "navigation",
    
    # Modal
    "after_modal_open": "modal",
    "after_modal_close": "modal",
    "after_scroll": "modal",
    "after_scroll_batch": "modal",
    
    # Input
    "after_click": "input",
    "after_type": "input",
    "mouse_wiggle": "input",
    "after_credentials": "input",
    "after_popup_dismiss": "input",
    
    # Actions (high risk)
    "after_message_open": "action",
    "after_dm_type": "action",
    "after_dm_send": "action",
    "after_follow": "action",
    "after_login_submit": "action",
    
    # Pacing
    "between_profiles": "pacing",
    "between_seeds": "pacing",
    "queue_empty": "pacing",
}


# ═══════════════════════════════════════════════════════════════════════════════
# TIMEOUTS - Maximum wait before giving up (not for humanization)
# ═══════════════════════════════════════════════════════════════════════════════

# Global timeout multiplier (useful for slow connections)
TIMEOUT_SCALE = _float("TIMEOUT_SCALE", 1.0)

# Base timeout values in milliseconds
TIMEOUTS = {
    # Page loads
    "page_load": 30000,
    "navigation": 20000,
    
    # Element waits
    "element_default": 10000,
    "element_modal": 5000,
    "element_button": 3000,
    "element_input": 5000,
    
    # Actions
    "login": 15000,
    "dm_send": 10000,
    "follow": 3000,
}


# ═══════════════════════════════════════════════════════════════════════════════
# API & CREDENTIALS
# ═══════════════════════════════════════════════════════════════════════════════

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

