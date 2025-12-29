# Scout - Instagram Creator Discovery Agent

An Instagram automation agent that discovers influencers with monetization links by exploring Following networks, using keyword matching and vision AI.

## Quick Start

### 1. Clone and Install
```bash
git clone <repo>
cd scout
npm install
```

### 2. Setup Services

**You'll need accounts for:**
- **[AdsPower](https://adspower.net)** - Browser fingerprinting ($9/month base)
- **[SmartProxy](https://smartproxy.com)** - Residential proxies ($12.5/GB)
- **[OpenRouter](https://openrouter.ai)** - Vision AI ($10-30/month)
- **Postgres Database** - Railway/Supabase/Neon (free tier available)

**Detailed setup guide:** See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)

### 3. Configure Environment

Create a `.env` file with your credentials:

```bash
# SmartProxy (get from smartproxy.com dashboard)
SMARTPROXY_USERNAME=sp1234567
SMARTPROXY_PASSWORD=your_password
SMARTPROXY_HOST=gate.smartproxy.com
SMARTPROXY_PORT=7000

# AdsPower (Local API - default: http://127.0.0.1:50325)
ADSPOWER_API_BASE=http://127.0.0.1:50325

# Instagram
INSTAGRAM_USERNAME=your_ig_username
INSTAGRAM_PASSWORD=your_ig_password

# OpenRouter (for vision AI)
OPENROUTER_API_KEY=your_openrouter_key

# Database
DATABASE_URL=postgresql://user:pass@host:5432/scout
```

### 4. Setup Database

```bash
npx prisma migrate deploy
```

### 5. Configure Profiles

```bash
cp profiles.config.example.json profiles.config.json
# Edit profiles.config.json with your AdsPower profile IDs and Instagram accounts
```

### 6. Run Discovery

```bash
npm run discover
```

## Deployment

**Recommended: VPS** (Hetzner $4/mo or DigitalOcean $6/mo)

- ✅ No risk of suspension for automation
- ✅ Full control over your server
- ✅ Auto-deploy from GitHub (push to deploy)
- ✅ Cheaper than Railway

**Quick start guides:**
- 🚀 **[docs/QUICKSTART_VPS.md](docs/QUICKSTART_VPS.md)** - 15 minute setup (recommended)
- 📖 **[docs/VPS_SETUP.md](docs/VPS_SETUP.md)** - Detailed walkthrough with troubleshooting
- 🔧 **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** - All deployment options (VPS, Railway, Local)

**Why not Railway?** They prohibit scraping/automation in ToS. VPS gives you freedom.

## Configuration

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
├── functions/        # Modular TypeScript functions
│   ├── auth/         # Authentication & login
│   ├── extraction/   # Bio, links, and content extraction
│   ├── navigation/   # Browser and page navigation
│   ├── profile/      # Profile analysis and actions
│   ├── shared/       # Database, config, utils, logger
│   └── timing/       # Human-like delays and behavior
├── scripts/          # Main execution scripts
│   ├── scrape.ts     # Main scraper orchestration
│   └── login_screenshot.ts
├── seeds.txt         # Seed usernames to start from
├── tests/            # 153 tests covering all logic
└── functions/**/*.test.ts  # Collocated unit tests
```

## Quick Start

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env  # Edit with your credentials

# Add seeds (known creator usernames to start exploring from)
echo "somemodel" >> seeds.txt

# Test individual components
npm run analyze some_profile    # Test profile analysis
npm run follow test_user        # Test following
npm run dm test_user           # Test DM sending

# Run discovery automation
npm run discover               # Safe discovery (no DMs, just finds & follows)
npm run discover:dm            # Full automation (finds, follows, AND sends DMs)
```

## 📋 Available Scripts

Scout provides both **individual testing scripts** and **full automation scripts**:

### Individual Testing Scripts (For Development & Manual Operations)
```bash
npm run analyze <username>     # Analyze profile for creator indicators
npm run follow <username>      # Follow a specific user
npm run dm <username>          # Send DM to a specific user
npm run following <username>   # Extract following list from profile
npm run process <users> [opts] # Batch process multiple profiles
```

### Full Automation Scripts
```bash
# Discovery (no DMs - safe for testing)
npm run discover               # Find and follow creators (no DMs)
npm run discover:debug         # Same with debug logging

# Discovery with DMs (full automation)
npm run discover:dm            # Find, follow, AND send DMs to creators
npm run discover:dm:debug      # Same with debug logging

# Legacy full automation
npm run scrape                 # Full automation with DMs
```

📖 **Detailed documentation:** See [`SCRIPTS.md`](SCRIPTS.md) for comprehensive usage examples and testing workflows.

## Development

```bash
# Run tests
npm test

# Run E2E tests
npm run test:e2e

# Development with debugging
npm run scrape -- --debug
```

## Configuration

### Environment Variables

All configuration is done via `.env` file. Required variables:

```bash
# Services (required)
ADSPOWER_API_BASE=http://127.0.0.1:50325  # AdsPower Local API
SMARTPROXY_USERNAME=sp1234567          # SmartProxy username
SMARTPROXY_PASSWORD=your-pass          # SmartProxy password
OPENROUTER_API_KEY=your-key            # Vision AI API key

# Instagram (required)
INSTAGRAM_USERNAME=your-ig-user
INSTAGRAM_PASSWORD=your-ig-pass

# Database (required)
DATABASE_URL=postgresql://...          # Postgres connection string

# Development flags (optional)
LOCAL_BROWSER=false                    # Skip AdsPower/proxy for testing
DEBUG_LOGS=false                       # Verbose logging
FAST_MODE=false                        # Reduced delays for testing
```

### Config Options (`functions/shared/config/config.ts`)

| Variable               | Default                       | Description                           |
| ---------------------- | ----------------------------- | ------------------------------------- |
| `VISION_MODEL`         | `google/gemini-flash-1.5-exp` | Vision AI model for linktree analysis |
| `CONFIDENCE_THRESHOLD` | `80`                          | Min confidence to confirm creator     |
| `MAX_DMS_PER_DAY`      | `120`                         | Daily DM limit                        |
| `DM_MESSAGE`           | (customizable)                | Message to send                       |

## Database Schema

Postgres via Prisma (set `DATABASE_URL`):

- **profiles** - All visited profiles with bio, score, creator status, DM/follow tracking
- **queue** - Priority queue with source tracking (seed vs discovered)
- **following_scraped** - Tracks scroll position for pagination
- **metrics** - Performance and usage statistics

Apply migrations (Railway-friendly):

```bash
npx prisma migrate deploy
```

## Bio Matching Keywords

The `functions/profile/bioMatcher/bioMatcher.ts` module scores bios based on:

**Emojis** (25 points max):
🔗 ✨ 👀 ⬇️ 👇 💕 ❤️

**Keywords** (50 points max):

- Direct: `patreon`, `ko-fi`, `fanvue`
- Hints: `link in bio`, `linktree`, `exclusive`, `exclusive`, `spicy`
- Actions: `dm for`, `subscribe`, `free trial`

**Links** (25 points max):

- `linktr.ee/xxx`, `patreon.com/xxx`, `ko-fi.com/xxx`, etc.

## Configuration

### Environment Variables

Create a `.env` file with the following variables:

```bash
# ===========================================
# BROWSER & PROXY CONFIGURATION
# ===========================================

# BrowserLess.io API token (required for production)
BROWSERLESS_TOKEN=your_browserless_token_here

# Use local browser instead of BrowserLess (for development)
LOCAL_BROWSER=false

# ===========================================
# INSTAGRAM CREDENTIALS
# ===========================================

INSTAGRAM_USERNAME=your_instagram_username
INSTAGRAM_PASSWORD=your_instagram_password

# ===========================================
# AI & VISION API
# ===========================================

# OpenRouter API key for vision analysis (Gemini models)
OPENROUTER_API_KEY=your_openrouter_api_key

# ===========================================
# PERFORMANCE & DEBUGGING
# ===========================================

# Enable debug logging
DEBUG_LOGS=false

# Run in fast mode (reduced delays, skip vision - for testing)
FAST_MODE=false

# Skip vision API calls entirely (for testing)
SKIP_VISION=false
```

### AdsPower + SmartProxy Setup

**Why This Stack?**

- **AdsPower**: Enterprise-grade browser fingerprinting and anti-detection
  - Unique fingerprints per profile (Canvas, WebGL, WebRTC, fonts, etc.)
  - Persistent browser sessions with cookies
  - Local API for automation
  
- **SmartProxy**: Rotating residential IPs with sticky sessions
  - 15-30 minute sticky sessions for consistent IP
  - Auto-rotation for safety
  - Geo-targeting support (match browser timezone)

**How It Works:**

```
Your Script → AdsPower (fingerprint) → SmartProxy (residential IP) → Instagram
```

**Setup Steps:**

1. **AdsPower Setup**
   - Download from [adspower.net](https://www.adspower.net)
   - Install and enable Local API (Settings → Local API → Enable)
   - Create a browser profile for each Instagram account
   - Copy profile user_id → `profiles.config.json`

2. **SmartProxy Account**
   - Sign up at [smartproxy.com](https://smartproxy.com)
   - Get credentials from dashboard
   - Add to `.env` → `SMARTPROXY_USERNAME` and `SMARTPROXY_PASSWORD`

3. **Integration** (already implemented!)
   - Code automatically connects to AdsPower via Local API
   - Injects SmartProxy credentials into browser
   - Creates sticky sessions (15-30 min)
   - Auto-rotates when session expires

**Detailed setup guide:** See [docs/ADSPOWER_SETUP.md](docs/ADSPOWER_SETUP.md) for step-by-step instructions.

**Cost:**
- **AdsPower**: $9/month base (custom pricing for many profiles)
- **SmartProxy**: $12.5/GB (~10-50GB/month = $125-625)
- **Vision API**: $10-30/month
- **Total**: ~$150-665/month

## Tests

```bash
# Run all tests (153 tests)
npm test

# Run specific test suites
npm run test:e2e:scrape      # E2E scrape tests
npm run test:e2e:check-profile  # E2E profile checking

# Test coverage
npm run test:coverage
```

Tests cover:
- **Bio matching** (keyword/emoji scoring)
- **Database operations** (Postgres via Prisma with visit/DM/follow tracking)
- **Browser automation** (navigation, modal operations)
- **Profile analysis** (vision AI, creator detection)
- **Integration flows** (end-to-end scraping workflows)

## Safety Features

- Random 5-15s delays between profile visits
- Random 60-180s delays between seed profiles
- Human-like scrolling and mouse movements
- Pagination tracking (resume from where you left off)
- Duplicate visit prevention
- DM thread check (won't message if conversation exists)
