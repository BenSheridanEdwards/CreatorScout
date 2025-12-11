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

# Run the scraper
npm run scrape
```

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

Edit `.env`:

```env
BROWSERLESS_TOKEN=your_browserless_io_token
OPENROUTER_API_KEY=your_openrouter_key
INSTAGRAM_USERNAME=your_ig_username
INSTAGRAM_PASSWORD=your_ig_password
```

### Config Options (`functions/shared/config/config.ts`)

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

The `functions/profile/bioMatcher/bioMatcher.ts` module scores bios based on:

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
- **Database operations** (SQLite with visit/DM/follow tracking)
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
