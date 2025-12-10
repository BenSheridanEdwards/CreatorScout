# Scout - Instagram Creator Discovery Agent

An Instagram automation agent that discovers influencers with monetization links by exploring Following networks, using keyword matching and vision AI.

## The Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  1. START: Load seed usernames from seeds.txt                   │
└─────────────────────────┬───────────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  2. Go to seed profile → Click "Following" → Open modal         │
└─────────────────────────┬───────────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  3. Extract <li> list items (batch of 10 usernames)             │
└─────────────────────────┬───────────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  4. For each username:                                          │
│     ├─ Skip if already visited (database check)                 │
│     ├─ Click into profile                                       │
│     ├─ Read bio text                                            │
│     └─ Keyword/emoji matching (CHEAP - no API call)             │
│        • 🔥💋😈 link emojis                               │
│        • "patreon", "link in bio", "exclusive", etc.           │
└─────────────────────────┬───────────────────────────────────────┘
                          ▼
              ┌───────────────────────┐
              │  Bio score >= 40?     │
              └───────────┬───────────┘
                    YES   │   NO → Skip, next profile
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  5. If has linktree link:                                       │
│     ├─ Click link to open linktree page                         │
│     ├─ Screenshot the page                                      │
│     └─ Vision AI analysis (EXPENSIVE - only when promising)     │
│        Look for: creator links, "exclusive", "NSFW", etc.            │
└─────────────────────────┬───────────────────────────────────────┘
                          ▼
              ┌───────────────────────┐
              │  Confirmed creator?   │
              │  (confidence >= 80)   │
              └───────────┬───────────┘
                    YES   │   NO → Skip, next profile
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  6. CONFIRMED CREATOR ACTIONS:                                  │
│     ├─ Check DM thread is empty (no previous messages)          │
│     ├─ Send DM + screenshot proof                               │
│     ├─ Follow if not already following                          │
│     ├─ Mark in database                                         │
│     └─ Add their Following to queue (TREE EXPANSION)            │
└─────────────────────────┬───────────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  7. PAGINATION:                                                 │
│     ├─ If all 10 profiles in batch already visited              │
│     ├─ Scroll modal to load more                                │
│     └─ Get next batch of 10 (continue from scroll_index)        │
└─────────────────────────┬───────────────────────────────────────┘
                          ▼
                    Loop back to step 3
```

## Smart Cost Optimization

| Step                     | Cost          | When Used                              |
| ------------------------ | ------------- | -------------------------------------- |
| Keyword/emoji matching   | **FREE**      | Every profile                          |
| Vision AI (Gemini Flash) | ~$0.001/image | Only promising profiles with linktrees |

By doing keyword matching first, Scout avoids expensive vision API calls on 80%+ of profiles.

## Project Structure

```
scout/
├── main.py           # Main flow orchestration
├── bio_matcher.py    # Keyword/emoji scoring (NEW - free matching)
├── vision.py         # Vision AI for linktree analysis
├── browser_agent.py  # Playwright browser automation
├── database.py       # SQLite with visit/DM/follow tracking
├── humanize.py       # Human-like delays and scrolling
├── config.py         # Environment configuration
├── utils.py          # Screenshot utilities
├── seeds.txt         # Seed usernames to start from
└── tests/            # 43 tests covering all logic
```

## Quick Start

```bash
# Install
pip install -r requirements.txt

# Configure
cp .env.example .env  # Edit with your credentials

# Add seeds (known creator usernames to start exploring from)
echo "somemodel" >> seeds.txt

# Run
python main.py
```

## Configuration

Edit `.env`:

```env
BROWSERLESS_TOKEN=your_browserless_io_token
OPENROUTER_API_KEY=your_openrouter_key
INSTAGRAM_USERNAME=your_ig_username
INSTAGRAM_PASSWORD=your_ig_password
```

### Config Options (`config.py`)

| Variable               | Default                       | Description                           |
| ---------------------- | ----------------------------- | ------------------------------------- |
| `VISION_MODEL`         | `google/gemini-flash-1.5-exp` | Vision AI model for linktree analysis |
| `CONFIDENCE_THRESHOLD` | `80`                          | Min confidence to confirm creator     |
| `MAX_DMS_PER_DAY`      | `120`                         | Daily DM limit                        |
| `DM_MESSAGE`           | (customizable)                | Message to send                       |

## Database Schema

SQLite with WAL mode (`scout.db`):

- **profiles** - All visited profiles with bio, score, creator status, DM/follow tracking
- **queue** - Priority queue with source tracking (seed vs discovered)
- **following_scraped** - Tracks scroll position for pagination

## Bio Matching Keywords

The `bio_matcher.py` module scores bios based on:

**Emojis** (25 points max):
🔗 ✨ 👀 ⬇️ 👇 💕 ❤️

**Keywords** (50 points max):

- Direct: `patreon`, `ko-fi`, `fanvue`
- Hints: `link in bio`, `linktree`, `exclusive`, `exclusive`, `spicy`
- Actions: `dm for`, `subscribe`, `free trial`

**Links** (25 points max):

- `linktr.ee/xxx`, `patreon.com/xxx`, `ko-fi.com/xxx`, etc.

## Tests

```bash
python -m pytest tests/ -v
# 43 tests covering:
# - Bio matching (21 tests)
# - Database operations (13 tests)
# - Integration (7 tests)
# - Utils (2 tests)

# Puppeteer E2E (Node test runner)
node --test tests/e2e_puppeteer.test.js
```

## Safety Features

- Random 5-15s delays between profile visits
- Random 60-180s delays between seed profiles
- Human-like scrolling and mouse movements
- Pagination tracking (resume from where you left off)
- Duplicate visit prevention
- DM thread check (won't message if conversation exists)
