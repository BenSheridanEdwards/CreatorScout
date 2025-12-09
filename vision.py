"""Vision AI for analyzing linktree/link pages."""
import base64
import json
from openai import OpenAI
from config import OPENROUTER_API_KEY, VISION_MODEL

client = OpenAI(base_url="https://openrouter.ai/api/v1", api_key=OPENROUTER_API_KEY)


LINKTREE_PROMPT = """You are analyzing a screenshot of a link page (linktree, beacons, etc.) for an Instagram user.

Determine if this person is an Patreon/premium content creator.

Look for:
- Direct links to Patreon, Ko-fi, FanVue, or similar platforms
- Words like "Exclusive", "exclusive", "NSFW", "Spicy", "Subscribe", "VIP"
- Link imagery or text
- "Free trial" or subscription mentions
- Adult content warnings

Return EXACTLY this JSON:
{
  "is_adult_creator": true or false,
  "confidence": 0-100,
  "platform_links": ["patreon.com/xxx", "ko-fi.com/xxx"] or [],
  "indicators": ["has creator link", "exclusive warning", ...] or [],
  "reason": "brief explanation (max 15 words)"
}
"""


def analyze_linktree(image_path: str) -> dict | None:
    """
    Analyze a linktree/link page screenshot.
    Returns dict with is_adult_creator, confidence, platform_links, etc.
    """
    try:
        b64 = base64.b64encode(open(image_path, "rb").read()).decode()
        
        resp = client.chat.completions.create(
            model=VISION_MODEL,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "text", "text": LINKTREE_PROMPT},
                    {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b64}"}}
                ]
            }],
            max_tokens=400,
            temperature=0.0
        )
        
        txt = resp.choices[0].message.content
        txt = txt.strip().removeprefix("```json").removeprefix("```").removesuffix("```")
        return json.loads(txt.strip())
        
    except Exception as e:
        print(f"  Vision analysis failed: {e}")
        return None


def is_confirmed_creator(image_path: str, threshold: int = 70) -> tuple[bool, dict | None]:
    """
    Analyze linktree screenshot and determine if confirmed influencer.
    Returns (is_confirmed, analysis_data).
    """
    data = analyze_linktree(image_path)
    if not data:
        return False, None
    
    is_confirmed = data.get("is_adult_creator", False) and data.get("confidence", 0) >= threshold
    return is_confirmed, data

