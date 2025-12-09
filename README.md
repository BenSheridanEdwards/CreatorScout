# Scout - Production Instagram Discovery Agent

An Instagram automation agent that discovers profiles using browser automation and vision AI.

## Features

- 🔐 **Safe** - Human-like delays, mouse movements, and scrolling
- 🤖 **Vision AI** - Analyzes profiles using Gemini Flash 1.5
- 📊 **Smart Queue** - Priority-based queue with source tracking
- 🌳 **Tree Expansion** - Only expands from confirmed creators
- 📸 **Proof Screenshots** - Saves proof of every DM sent
- 🚫 **No Repeats** - Never DMs the same person twice
- ⏰ **Gentle Rate Limits** - 40-120s between actions, max 120 DMs/day

## Quick Start

```bash
# 1. Install dependencies
pip install -r requirements.txt
playwright install chromium

# 2. Configure .env with your keys
cp .env.example .env  # then edit with your credentials

# 3. Add seed usernames to seeds.txt (one per line, no @)

# 4. Run
python main.py
```

## Project Structure

```
scout/
├── main.py           # Main orchestration loop
├── browser_agent.py  # Playwright browser automation + stealth
├── vision.py         # Vision AI analysis (OpenRouter/Gemini)
├── database.py       # SQLite with WAL mode
├── humanize.py       # Human-like behavior simulation
├── utils.py          # Screenshot utilities
├── config.py         # Environment configuration
├── seeds.txt         # Seed usernames
├── requirements.txt
└── screenshots/      # Auto-created for proofs
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

| Variable               | Default                       | Description                      |
| ---------------------- | ----------------------------- | -------------------------------- |
| `VISION_MODEL`         | `google/gemini-flash-1.5-exp` | Vision AI model                  |
| `CONFIDENCE_THRESHOLD` | `80`                          | Min confidence to consider match |
| `MAX_DMS_PER_DAY`      | `120`                         | Daily DM limit                   |
| `DM_MESSAGE`           | (customizable)                | Message to send                  |

## Database Schema

SQLite with WAL mode (`scout.db`):

- **profiles** - Analyzed profiles with metadata, DM status, proof paths
- **queue** - Priority queue with source tracking
- **followers_scraped** - Track which followers lists were scraped

## How It Works

1. **Login** to Instagram via Browserless.io cloud browser
2. **Load seeds** from `seeds.txt` into priority queue
3. **Process each profile**:
   - Navigate with human-like scrolling
   - Screenshot the followers modal
   - Analyze with vision AI
   - If confidence ≥ 80% AND is_patreon → send DM
   - Save proof screenshot
   - Add confirmed creators back to queue for tree expansion
4. **Wait 40-120s** between profiles (extremely gentle)
5. **Repeat** until daily limit reached

## Required Services

- [Browserless.io](https://browserless.io) - Cloud browser service
- [OpenRouter](https://openrouter.ai) - AI API gateway (for Gemini Flash)

## Safety Features

- Random delays between ALL actions
- Human-like mouse movements and scrolling
- Stealth mode to avoid bot detection
- WAL mode database for crash resistance
- Never repeats DMs to same user
- Proof screenshots for every DM

## Disclaimer

This tool is for educational purposes. Always comply with Instagram's Terms of Service and respect user privacy.
