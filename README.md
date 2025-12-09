# Scout - Instagram Profile Discovery Agent

An automated agent that discovers and analyzes Instagram profiles using browser automation and vision AI.

## Features

- 🤖 Browser automation with human-like behavior (random delays, mouse movements, scrolling)
- 👁️ Vision AI analysis of profile screenshots
- 📊 SQLite database for tracking profiles and queue management
- 🔄 Automatic follower discovery and queue expansion
- 🛡️ Stealth mode to avoid detection

## Setup

### 1. Install Dependencies

```bash
pip install -r requirements.txt
playwright install chromium
```

### 2. Configure Environment

Edit `.env` with your credentials:

```env
BROWSERLESS_TOKEN=your_browserless_io_token_here
OPENROUTER_API_KEY=your_openrouter_key_here
INSTAGRAM_USERNAME=your_ig_username
INSTAGRAM_PASSWORD=your_ig_password
```

**Required services:**

- [Browserless.io](https://browserless.io) - Cloud browser service
- [OpenRouter](https://openrouter.ai) - AI API gateway for vision models

### 3. Add Seed Accounts

Edit `seeds.txt` with Instagram usernames (one per line, no @ symbol):

```
username1
username2
username3
```

### 4. Run

```bash
python main.py
```

## Project Structure

```
scout/
├── main.py           # Main entry point and orchestration
├── browser_agent.py  # Browser automation (Playwright)
├── vision.py         # Vision AI analysis (OpenRouter)
├── database.py       # SQLite database operations
├── humanize.py       # Human-like behavior simulation
├── utils.py          # Utility functions
├── config.py         # Configuration from environment
├── seeds.txt         # Seed usernames
├── requirements.txt  # Python dependencies
└── screenshots/      # Auto-created for screenshots
```

## Configuration Options

| Variable               | Default                 | Description                                    |
| ---------------------- | ----------------------- | ---------------------------------------------- |
| `CONFIDENCE_THRESHOLD` | 80                      | Minimum confidence score to consider a profile |
| `MAX_DMS_PER_RUN`      | 999                     | Maximum operations per run                     |
| `VISION_MODEL`         | google/gemini-flash-1.5 | Vision AI model to use                         |

## Database Schema

The agent uses SQLite (`scout.db`) with two tables:

- **profiles**: Stores analyzed profiles with metadata
- **queue**: Priority queue of usernames to process

## Safety Features

- Random delays between actions (30-90 seconds between profiles)
- Human-like scrolling and mouse movements
- Stealth mode to avoid bot detection
- Rate limiting built into the main loop

## Disclaimer

This tool is for educational purposes. Always comply with Instagram's Terms of Service and respect user privacy. The authors are not responsible for any misuse.
