"""Bio matching logic - keyword and emoji detection."""
import re

# Sexual/link emojis commonly used by creators
LINK_EMOJIS = {
    '🔥', '💋', '😈', '👅', '🍑', '🍒', '💦', '🥵', '😏', '💕', 
    '❤️', '🖤', '💜', '🤍', '💗', '🔞', '⬇️', '👇', '📩', '💌',
    '🎀', '🌹', '💎', '✨', '⭐', '🌟', '💫', '🦋', '🐰', '😘',
    '🥰', '💞', '💓', '💝', '💖', '❣️', '💟', '♥️', '🫦', '👀'
}

# Keywords that suggest OF/premium content
KEYWORDS = [
    # Direct mentions
    'patreon', 'creator link', 'ko-fi', 'fanvue', 'loyalfans', 'fanfix', 'fanhouse',
    # Link hints
    'link in bio', 'linkinbio', 'linktr', 'linktree', 'beacons', 'allmylinks',
    'tap here', 'click here', 'link below', '⬇️ link', 'bio link',
    # Content hints
    'exclusive', 'exclusive content', 'spicy', 'spicy content',
    'uncensored', 'uncut', 'explicit', 'xxx', 'x rated',
    'exclusive', '18 +', '+18', '🔞', 'nsfw', 'premium content',
    'content creator', 'creator',
    # Subscription hints  
    'subscribe', 'subscription', 'premium', 'vip', 'free trial',
    'dm for', 'dm me', 'message for', 'collab', 'collabs',
    '% off', 'discount', 'sale', 'limited', 'unlock', 'join me',
    # Link phrases
    'come play', 'come see', 'see more', 'want more', 'full videos',
    'full content', 'private content', 'private page', 'secret page',
    'naughty', 'bad girl', 'good girl', 'daddy', 'baby girl',
]

DISCOUNT_PATTERNS = [
    r'\d{1,3}\s*%\s*off',
    r'\bdiscount\b',
    r'\bsale\b',
    r'limited\s+offer',
    r'limited\s+time',
    r'special\s+offer',
]

EXCLUSIVE_PATTERNS = [
    r'exclusive\s+content',
    r'premium\s+content',
    r'vip\s+access',
    r'private\s+content',
    r'uncensored',
    r'unfiltered',
]

# Patterns for links
LINK_PATTERNS = [
    r'linktr\.ee/\w+',
    r'beacons\.ai/\w+',
    r'allmylinks\.com/\w+',
    r'patreon\.com/\w+',
    r'ko-fi\.com/\w+',
    r'fanvue\.com/\w+',
    r'fanfix\.io/\w+',
    r'fanhouse\.app/\w+',
    r'loyalfans\.com/\w+',
    r'manyvids\.com/\w+',
]


def count_link_emojis(text: str) -> int:
    """Count how many link emojis are in the text."""
    return sum(1 for char in text if char in LINK_EMOJIS)


def find_keywords(text: str) -> list[str]:
    """Find matching keywords in text."""
    text_lower = text.lower()
    found = []
    for kw in KEYWORDS:
        if kw in text_lower:
            found.append(kw)
    return found


def extract_links(text: str) -> list[str]:
    """Extract potential linktree/profile links from bio."""
    links = []
    for pattern in LINK_PATTERNS:
        matches = re.findall(pattern, text, re.IGNORECASE)
        links.extend(matches)
    return links


def calculate_score(bio: str) -> dict:
    """
    Calculate a confidence score for whether this is an creator.
    Returns dict with score (0-100) and reasons.
    """
    if not bio:
        return {"score": 0, "reasons": [], "emojis": 0, "keywords": [], "links": []}
    
    emoji_count = count_link_emojis(bio)
    keywords = find_keywords(bio)
    links = extract_links(bio)
    bio_lower = bio.lower()
    has_discount = any(re.search(p, bio_lower) for p in DISCOUNT_PATTERNS)
    has_exclusive = any(re.search(p, bio_lower) for p in EXCLUSIVE_PATTERNS)
    
    score = 0
    reasons = []
    
    # Emoji scoring (max 25 points)
    if emoji_count >= 5:
        score += 25
        reasons.append(f"{emoji_count} link emojis")
    elif emoji_count >= 3:
        score += 15
        reasons.append(f"{emoji_count} link emojis")
    elif emoji_count >= 1:
        score += 5
        reasons.append(f"{emoji_count} link emoji")
    
    # Keyword scoring (max 50 points base + bonus heuristics)
    if 'patreon' in [k.lower() for k in keywords]:
        score += 50
        reasons.append("mentions Patreon directly")
    elif any(k in ['ko-fi', 'fanvue', 'loyalfans'] for k in [k.lower() for k in keywords]):
        score += 45
        reasons.append("mentions adult platform")
    elif any(k in ['exclusive', 'exclusive', 'nsfw', 'spicy'] for k in [k.lower() for k in keywords]):
        score += 30
        reasons.append("premium content keywords")
    elif any(k in ['link in bio', 'linktree', 'linktr'] for k in [k.lower() for k in keywords]):
        score += 15
        reasons.append("link in bio hint")
    elif keywords:
        score += 10
        reasons.append(f"keywords: {', '.join(keywords[:3])}")

    # Heuristic: exclusive content + discount language (strong signal even without explicit OF link)
    # Adds up to 25 points but capped by overall max=100
    if has_exclusive and has_discount:
        score += 25
        reasons.append("exclusive content + discount offer")
    elif has_exclusive:
        score += 10
        reasons.append("exclusive content wording")
    elif has_discount:
        score += 8
        reasons.append("discount/promo wording")
    
    # Link scoring (max 25 points)
    if any('patreon' in l.lower() for l in links):
        score += 25
        reasons.append("creator link in bio")
    elif links:
        score += 15
        reasons.append(f"has linktree: {links[0]}")
    
    return {
        "score": min(score, 100),
        "reasons": reasons,
        "emojis": emoji_count,
        "keywords": keywords,
        "links": links
    }


def is_likely_creator(bio: str, threshold: int = 40) -> tuple[bool, dict]:
    """
    Quick check if bio suggests this is likely an creator.
    Returns (is_likely, details).
    
    Use threshold=40 for "worth exploring linktree"
    Use threshold=70 for "pretty confident this is a creator"
    """
    result = calculate_score(bio)
    return result["score"] >= threshold, result


