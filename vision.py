"""Vision AI for analyzing linktree/link pages."""
import base64
import json
from openai import OpenAI
from config import OPENROUTER_API_KEY, VISION_MODEL

client = OpenAI(base_url="https://openrouter.ai/api/v1", api_key=OPENROUTER_API_KEY)


LINKTREE_PROMPT = """You are analyzing a screenshot of a link page (linktree, beacons, allmylinks, etc.) for an Instagram user.

Determine if this person is an Patreon/premium content creator.

STRONG INDICATORS (high confidence if present):
- Direct links to: Patreon, Ko-fi, FanVue, Fanfix, Fanhouse, LoyalFans, Pornhub, ManyVids
- Text like "Exclusive Content", "Premium Content", "VIP Access", "Private Content"
- Discount language: "% OFF", "Sale", "Limited offer", "Free trial"
- Subscription CTAs: "Subscribe", "Join me", "Unlock", "See more"
- Adult warnings: "exclusive", "NSFW", "Adults only", "Must be 18"

MODERATE INDICATORS (consider with other factors):
- Link/revealing imagery (bikini, lingerie, provocative poses)
- Emojis: 🔥💋🍑🍒💕✨ combined with subscription language
- Words: "Spicy", "Naughty", "Uncensored", "Unfiltered", "Content creator"
- High follower counts with link aggregator pages

IMPORTANT: "Exclusive Content" + discount (e.g. "80% OFF") + link imagery = VERY HIGH confidence even without explicit creator link.

Return EXACTLY this JSON:
{
  "is_adult_creator": true or false,
  "confidence": 0-100,
  "platform_links": ["patreon.com/xxx", "ko-fi.com/xxx"] or [],
  "indicators": ["Exclusive Content with discount", "link imagery", ...] or [],
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


def _contains_any(text: str, patterns: list[str]) -> bool:
    """Case-insensitive substring check for any pattern."""
    lt = text.lower()
    return any(p.lower() in lt for p in patterns)


def _has_exclusive_discount_signal(data: dict) -> bool:
    """
    Heuristic: exclusive content + discount language is a strong adult signal
    even without explicit creator links.
    """
    indicators = data.get("indicators") or []
    reason = data.get("reason") or ""
    text = " ".join(indicators + [reason]).lower()

    strong = _contains_any(
        text,
        [
            "exclusive content",
            "premium content",
            "vip access",
            "private content",
            "uncensored",
            "unfiltered",
            "nsfw",
            "exclusive",
        ],
    )
    discount = _contains_any(text, ["% off", "discount", "sale", "limited offer"])
    return strong and discount


def is_confirmed_creator(image_path: str, threshold: int = 70) -> tuple[bool, dict | None]:
    """
    Analyze linktree screenshot and determine if confirmed influencer.
    Returns (is_confirmed, analysis_data).
    """
    data = analyze_linktree(image_path)
    if not data:
        return False, None
    
    is_confirmed = data.get("is_adult_creator", False) and data.get("confidence", 0) >= threshold

    # Heuristic override: Exclusive content + discount language
    if not is_confirmed and _has_exclusive_discount_signal(data):
        data["is_adult_creator"] = True
        data["confidence"] = max(data.get("confidence", 0), threshold)
        indicators = data.get("indicators") or []
        if "exclusive+discount" not in [i.lower() for i in indicators]:
            indicators.append("exclusive+discount offer")
            data["indicators"] = indicators
        is_confirmed = True
    
    return is_confirmed, data


