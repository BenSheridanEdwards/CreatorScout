import base64
import json
from openai import OpenAI
from config import OPENROUTER_API_KEY, VISION_MODEL

client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=OPENROUTER_API_KEY
)


def encode_image(image_path: str) -> str:
    """Encode an image file to base64."""
    with open(image_path, "rb") as f:
        return base64.b64encode(f.read()).decode('utf-8')


VISION_PROMPT = """You are an expert at reading Instagram profiles from screenshots.
Extract exactly this JSON (nothing else):

{
  "username": "@handle or null",
  "display_name": "text or null",
  "bio": "full bio with emojis and line breaks or null",
  "link_url": "https://... or null",
  "linktree_items": ["Patreon ❤️", "Exclusive", ...] or null,
  "is_patreon": true/false,
  "confidence": 0-100,
  "reason": "short explanation"
}

Rules:
- is_patreon should be true if you see any indication of Patreon, Ko-fi, or similar premium content platforms
- confidence should reflect how certain you are about the is_patreon determination
- Look for keywords like: patreon, ko-fi, exclusive content, link in bio, linktree with premium content hints
- Return ONLY the JSON, no markdown formatting or extra text
"""


FOLLOWERS_PROMPT = """You are analyzing a screenshot of an Instagram followers list.
Extract usernames of profiles that appear to be content creators (especially premium content creators).

Look for indicators like:
- Profile pictures that suggest content creators
- Display names with emojis (🔥, 💋, ❤️, etc.)
- Usernames that hint at content creation

Return exactly this JSON:
{
  "usernames": ["username1", "username2", ...],
  "total_visible": number of visible profiles in screenshot,
  "likely_creators": number that appear to be content creators
}

Return ONLY the JSON, no markdown formatting.
"""


def analyze_screenshot(image_path: str) -> dict | None:
    """Analyze a profile screenshot using vision AI."""
    base64_image = encode_image(image_path)
    
    try:
        response = client.chat.completions.create(
            model=VISION_MODEL,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "text", "text": VISION_PROMPT},
                    {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{base64_image}"}}
                ]
            }],
            max_tokens=500
        )
        
        content = response.choices[0].message.content
        # Clean up potential markdown formatting
        content = content.strip()
        if content.startswith("```json"):
            content = content[7:]
        if content.startswith("```"):
            content = content[3:]
        if content.endswith("```"):
            content = content[:-3]
        
        return json.loads(content.strip())
    except Exception as e:
        print(f"Vision analysis error: {e}")
        return None


def analyze_followers_screenshot(image_path: str) -> dict | None:
    """Analyze a followers list screenshot to extract usernames."""
    base64_image = encode_image(image_path)
    
    try:
        response = client.chat.completions.create(
            model=VISION_MODEL,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "text", "text": FOLLOWERS_PROMPT},
                    {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{base64_image}"}}
                ]
            }],
            max_tokens=800
        )
        
        content = response.choices[0].message.content
        # Clean up potential markdown formatting
        content = content.strip()
        if content.startswith("```json"):
            content = content[7:]
        if content.startswith("```"):
            content = content[3:]
        if content.endswith("```"):
            content = content[:-3]
        
        return json.loads(content.strip())
    except Exception as e:
        print(f"Followers analysis error: {e}")
        return None
