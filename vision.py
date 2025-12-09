import base64
import json
from openai import OpenAI
from config import OPENROUTER_API_KEY, VISION_MODEL, CONFIDENCE_THRESHOLD

client = OpenAI(base_url="https://openrouter.ai/api/v1", api_key=OPENROUTER_API_KEY)

PROMPT = """You are an expert Instagram analyst.
From this screenshot extract EXACTLY this JSON and nothing else:

{
  "username": "@handle or null",
  "display_name": "text",
  "bio": "full bio with emojis and line breaks",
  "link_url": "https://linktr.ee/... or null",
  "linktree_items": ["Patreon", "Exclusive", "Twitter", ...] or null,
  "is_patreon": true or false,
  "confidence": 0-100,
  "reason": "max 12 words"
}
"""


def analyze(path: str) -> dict | None:
    b64 = base64.b64encode(open(path, "rb").read()).decode()
    try:
        resp = client.chat.completions.create(
            model=VISION_MODEL,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "text", "text": PROMPT},
                    {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b64}"}}
                ]
            }],
            max_tokens=600,
            temperature=0.0
        )
        txt = resp.choices[0].message.content
        txt = txt.strip().removeprefix("```json").removeprefix("```").removesuffix("```")
        return json.loads(txt.strip())
    except Exception as e:
        print("Vision failed:", e)
        return None
