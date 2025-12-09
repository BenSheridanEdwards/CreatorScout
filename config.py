import os
from dotenv import load_dotenv

load_dotenv()

BROWSERLESS_TOKEN = os.getenv("BROWSERLESS_TOKEN")
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
IG_USER = os.getenv("INSTAGRAM_USERNAME")
IG_PASS = os.getenv("INSTAGRAM_PASSWORD")

CONFIDENCE_THRESHOLD = int(os.getenv("CONFIDENCE_THRESHOLD", "80"))
MAX_DMS_PER_RUN = int(os.getenv("MAX_DMS_PER_RUN", "999"))

# Change only if you know what you're doing
VISION_MODEL = "google/gemini-flash-1.5"   # fastest & cheapest winner right now
# Alternatives (just uncomment):
# VISION_MODEL = "google/gemini-pro-vision-2.5"
# VISION_MODEL = "anthropic/claude-3-5-sonnet"
# VISION_MODEL = "openrouter/internvl3-78b"
