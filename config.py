from dotenv import load_dotenv
import os

load_dotenv()

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
