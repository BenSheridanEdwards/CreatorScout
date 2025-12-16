# Scout - Instagram Creator Discovery Scripts

Scout is an automated Instagram tool for discovering Patreon content creators and managing interactions. This document describes all available scripts and their purposes.

## 🚀 Quick Start

All scripts are available as npm commands. Make sure your environment variables are set:
- `INSTAGRAM_USERNAME` - Your Instagram username
- `INSTAGRAM_PASSWORD` - Your Instagram password
- `DEBUG_LOGS=true` - Enable detailed logging (optional)

## 📋 Available Scripts

### Individual Testing Scripts

These scripts perform single actions and are perfect for testing, debugging, and manual operations.

#### `npm run analyze <username>`
**Purpose:** Analyze a single Instagram profile for creator indicators

**What it does:**
- Navigates to the profile
- Reads the bio and analyzes it for Patreon/creator keywords
- Checks for external links (Linktree, etc.)
- Uses AI vision analysis on profile images if links are found
- Returns confidence score and creator status

**Output:**
```
🔍 Analyzing profile: @username
✅ Logged in successfully
📊 Analysis Results:
Bio: "Content creator | Patreon available..."
Confidence: 85%
Is Creator: ✅ YES
Links found: 1
  • https://linktr.ee/username
Key indicators:
  • Bio contains creator keywords: patreon
🎯 Meets confidence threshold (50%): ✅ YES
```

**Usage Examples:**
```bash
npm run analyze patreon_creator
npm run analyze instagram_user
```

---

#### `npm run follow <username>`
**Purpose:** Follow a specific Instagram user

**What it does:**
- Checks if already following (via database)
- Navigates to the profile
- Clicks the follow button
- Records the follow in database
- Handles already-following cases gracefully

**Output:**
```
👥 Following user: @username
✅ Logged in successfully
📍 Following @username...
✅ Successfully followed user
```

**Usage Examples:**
```bash
npm run follow confirmed_creator
npm run follow test_user
```

---

#### `npm run dm <username>`
**Purpose:** Send a DM to a specific Instagram user

**What it does:**
- Checks if DM already sent (via database)
- Navigates to DM inbox
- Searches for the user
- Types your configured DM message
- Sends the message with human-like delays
- Records the DM in database

**Output:**
```
💬 Sending DM to: @username
✅ Logged in successfully
📨 Sending DM to @username...
✅ DM sent successfully
```

**Configuration:** Set your DM message in `functions/shared/config/config.ts`:
```typescript
export const DM_MESSAGE = "Your custom message here";
```

**Usage Examples:**
```bash
npm run dm confirmed_creator
npm run dm potential_client
```

---

#### `npm run following <username> [count]`
**Purpose:** Extract following list from a profile

**What it does:**
- Navigates to the profile
- Opens the following modal
- Extracts usernames from the following list
- Returns numbered list of users

**Output:**
```
📋 Getting following list for: @username (max 20)
✅ Logged in successfully
📂 Opening following modal...
🔍 Extracting up to 20 usernames...

📊 Found 20 users in following list:
 1. @creator1
 2. @creator2
 3. @creator3
...
20. @creator20
```

**Usage Examples:**
```bash
npm run following seed_profile
npm run following seed_profile 50
```

---

#### `npm run process <usernames> [options]`
**Purpose:** Process multiple profiles with specific actions

**What it does:**
- Takes comma-separated list of usernames
- Applies selected actions to each profile
- Supports analyze, follow, and DM operations
- Processes profiles sequentially with human-like delays

**Options:**
- `--analyze` - Analyze profiles for creator indicators
- `--follow` - Follow profiles
- `--dm` - Send DMs to profiles
- If no options specified, defaults to `--analyze`

**Output:**
```
🚀 Processing 3 profiles with options: { analyze: true, follow: true, dm: false }

[1/3] Processing @user1
  📍 Navigating to @user1...
  🧠 Analyzing profile...
  📊 Confidence: 75%, Creator: YES
  👥 Following...
  ✅ Followed
  ✅ Completed @user1

[2/3] Processing @user2
...
```

**Usage Examples:**
```bash
# Analyze multiple profiles
npm run process user1,user2,user3 --analyze

# Follow multiple profiles
npm run process creator1,creator2 --follow

# Full workflow: analyze, follow, and DM
npm run process confirmed_creator1,confirmed_creator2 --analyze --follow --dm

# Default behavior (analyze only)
npm run process user1,user2,user3
```

---

## 🔄 Full Automation Scripts

These are your existing comprehensive automation scripts.

#### `npm run discover`
**Purpose:** Discovery mode - find creators without sending DMs

**What it does:**
- Loads seed profiles from `seeds.txt`
- Analyzes profiles for creator indicators
- Follows confirmed creators
- Expands network by exploring following lists
- **Does NOT send DMs** (safe for testing)

**Perfect for:** Building your creator database safely

---

#### `npm run scrape`
**Purpose:** Full automation - find creators and engage

**What it does:**
- Everything `discover` does PLUS:
- Sends DMs to confirmed creators
- Respects daily DM limits
- Full engagement workflow

**Perfect for:** Production creator discovery and outreach

---

## 🧪 Testing Workflow

Use these scripts progressively to test and validate your system:

### Phase 1: Individual Component Testing
```bash
# Test profile analysis
npm run analyze some_profile

# Test following functionality
npm run follow test_user

# Test DM sending
npm run dm test_user

# Test following extraction
npm run following seed_profile
```

### Phase 2: Combined Testing
```bash
# Test multi-profile analysis
npm run process user1,user2,user3 --analyze

# Test follow workflow
npm run process creator1,creator2 --follow

# Test full engagement
npm run process confirmed1,confirmed2 --analyze --follow --dm
```

### Phase 3: Full Automation
```bash
# Safe discovery
npm run discover

# Full engagement
npm run scrape
```

## ⚙️ Configuration

### Environment Variables
```bash
# Required
INSTAGRAM_USERNAME=your_username
INSTAGRAM_PASSWORD=your_password

# Optional
DEBUG_LOGS=true              # Enable detailed logging
LOCAL_BROWSER=true           # Use visible browser for debugging
FAST_MODE=true              # Skip delays for faster testing
```

### Config Files
- `seeds.txt` - List of seed profiles (one per line)
- `functions/shared/config/config.ts` - Timing, limits, and messages
- `scout.db` - SQLite database (auto-created)

## 🎯 Use Cases

### For Development & Testing
- Use individual scripts to isolate and test specific functions
- Debug issues by testing components separately
- Validate profile analysis accuracy
- Test DM delivery and follow functionality

### For Manual Operations
- Curate specific profiles before mass automation
- Send targeted DMs to high-value creators
- Extract following lists for network analysis
- Manual quality control of automation results

### For Production Automation
- `discover` for safe creator discovery
- `scrape` for full engagement automation
- `process` for targeted batch operations

## 🔧 Troubleshooting

### Common Issues

**Script fails with login error:**
- Check your `INSTAGRAM_USERNAME` and `INSTAGRAM_PASSWORD` environment variables
- Instagram may require 2FA or have security measures

**Profile not found:**
- Verify the username is correct
- Account may be private or suspended

**DM fails to send:**
- You may have reached Instagram's DM limits
- User may have DMs disabled or blocked you

**Analysis shows low confidence:**
- Profile may not be a content creator
- Bio may not contain clear creator indicators

### Debug Mode
Enable detailed logging:
```bash
DEBUG_LOGS=true npm run analyze username
```

### Browser Visibility
For debugging, make browser visible:
```bash
LOCAL_BROWSER=true npm run analyze username
```

## 📊 Database Schema

Scout uses SQLite to track all interactions:

- `profiles` - User profiles and analysis results
- `queue` - Processing queue for profiles
- `following_scraped` - Following list extraction progress
- `metrics` - Performance and usage statistics

All scripts automatically update the database to avoid duplicate operations.

---

## 🎉 Summary

**Individual Scripts** = Precise testing and manual control
**Full Automation** = Hands-off creator discovery and engagement

Choose the right tool for your current task! 🚀