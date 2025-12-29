# Schedule System Architecture & VPS Integration Guide

## 📋 Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Components](#components)
3. [How It Works](#how-it-works)
4. [Using the Schedule System](#using-the-schedule-system)
5. [VPS Integration (DigitalOcean)](#vps-integration-digitalocean)
6. [Troubleshooting](#troubleshooting)

---

## 🏗️ Architecture Overview

The schedule system provides a **visual timeline** of scheduled, running, and completed script executions. It combines:

- **Frontend UI**: Timeline visualization with real-time updates
- **Backend API**: Schedule management and run tracking
- **Cron Integration**: System crontab parsing for scheduled jobs
- **Config File**: One-off scheduled runs via `schedule.config.json`

### Data Flow

```
┌─────────────────┐
│  Crontab Jobs   │ ──┐
└─────────────────┘   │
                      │
┌─────────────────┐   │    ┌──────────────┐    ┌─────────────┐
│ schedule.config  │ ──┼───▶│  Server API  │───▶│  Frontend   │
│     .json        │   │    │  /api/schedule│    │  Timeline   │
└─────────────────┘   │    └──────────────┘    └─────────────┘
                      │
┌─────────────────┐   │
│  Running Scripts│ ──┘
│  (via cron)     │
└─────────────────┘
```

---

## 🧩 Components

### 1. **TimelineCarousel Component** (`frontend/src/components/TimelineCarousel/`)

**Purpose**: Visual timeline showing scheduled, running, and completed runs

**Key Features**:
- Horizontal timeline with cards positioned by time
- Real-time updates via WebSocket for running runs
- Auto-scrolls to center on current time
- Color-coded cards:
  - 🔵 **Scheduled**: Gray/dashed border
  - 🟢 **Running**: Blue with pulse animation
  - ✅ **Completed**: Green
  - ❌ **Error**: Red
- Stacking when multiple runs overlap in time
- Account filtering support

**Data Sources**:
- `/api/runs` - Completed and running runs
- `/api/schedule` - Scheduled runs (from crontab + config)

### 2. **AccountFilter Component** (`frontend/src/components/AccountFilter/`)

**Purpose**: Filter timeline by account/profile

**Features**:
- Loads accounts from scheduled runs
- Persists selection in localStorage
- Updates TimelineCarousel via prop

### 3. **Schedule API Endpoints** (`server.ts`)

#### `GET /api/schedule`
Returns all scheduled runs (cron + config file)

**Response**:
```json
[
  {
    "id": "scheduled_burner1_morning_1234567890",
    "profileId": "burner1",
    "scriptName": "discover",
    "scheduledTime": "2025-12-28T12:00:00Z",
    "sessionType": "morning",
    "accountName": "burner1",
    "cronPattern": "15 8 * * *"
  },
  {
    "id": "oneoff_1234567890",
    "profileId": "burner1",
    "scriptName": "discover",
    "scheduledTime": "2025-12-28T13:00:00Z",
    "accountName": "burner1"
  }
]
```

#### `GET /api/schedule/cron`
Parses system crontab and returns scheduled runs

#### `POST /api/schedule`
Adds a one-off scheduled run to `schedule.config.json`

**Request Body**:
```json
{
  "profileId": "burner1",
  "scriptName": "discover",
  "scheduledTime": "2025-12-28T14:00:00Z"
}
```

### 4. **Crontab Parser** (`functions/shared/runs/crontabParser.ts`)

**Purpose**: Parses system crontab to detect scheduled runs

**How It Works**:
1. Reads crontab via `crontab -l` or file system
2. Matches entries with pattern: `* * * * * cd /path && ./scripts/cron/schedule.sh <profile> <session>`
3. Uses `cron-parser` to calculate next occurrence
4. Returns `ScheduledRun[]` with next execution time

**Cron Pattern Matching**:
```bash
# Matches this pattern:
15 8 * * * cd /home/scout/scout && ./scripts/cron/schedule.sh burner1 morning
```

### 5. **Schedule Config File** (`schedule.config.json`)

**Purpose**: Store one-off scheduled runs (not recurring cron jobs)

**Format**:
```json
{
  "timezone": "Europe/London",
  "oneOff": [
    {
      "id": "discover_session_1",
      "profileId": "burner1",
      "scriptName": "discover",
      "scheduledTime": "2025-12-28T12:00:00Z",
      "accountName": "burner1"
    }
  ]
}
```

### 6. **Run Tracking** (`functions/shared/runs/runs.ts`)

**Purpose**: Track script executions with metadata

**Key Functions**:
- `createRun()` - Create new run entry
- `updateRun()` - Update run status/metrics
- `detectIssues()` - Auto-detect issues in completed runs
- `getAllRuns()` - Get all runs for timeline

**Run States**:
- `scheduled` - Not started yet
- `running` - Currently executing
- `completed` - Finished successfully
- `error` - Failed or crashed

---

## ⚙️ How It Works

### 1. **Scheduling a Run**

**Option A: Via Crontab (Recurring)**
```bash
# Setup crontab entries
./scripts/cron/setup_crontab.sh

# This creates entries like:
15 8 * * * cd /home/scout/scout && ./scripts/cron/schedule.sh burner1 morning
```

**Option B: Via Config File (One-off)**
```json
// Add to schedule.config.json
{
  "oneOff": [
    {
      "id": "manual_run_1",
      "profileId": "burner1",
      "scriptName": "discover",
      "scheduledTime": "2025-12-28T14:00:00Z"
    }
  ]
}
```

**Option C: Via API (One-off)**
```bash
curl -X POST http://localhost:4000/api/schedule \
  -H "Content-Type: application/json" \
  -d '{
    "profileId": "burner1",
    "scriptName": "discover",
    "scheduledTime": "2025-12-28T14:00:00Z"
  }'
```

### 2. **Execution Flow**

```
1. Cron triggers schedule.sh
   ↓
2. schedule.sh calls npm run cron:smart
   ↓
3. smartSessionRunner.ts creates run entry
   ↓
4. Run executes (Instagram automation)
   ↓
5. Run updates tracked in runs/{runId}.json
   ↓
6. Frontend polls /api/runs and /api/schedule
   ↓
7. TimelineCarousel displays runs in real-time
```

### 3. **Real-Time Updates**

- **WebSocket**: Live metrics for running runs (`/ws/runs?runId=...`)
- **Polling**: Fallback every 10 seconds
- **Thumbnail Updates**: Screenshots polled every 5 seconds during runs

---

## 🎯 Using the Schedule System

### Viewing the Timeline

1. **Start the server**:
   ```bash
   npm run dev:server
   ```

2. **Open the dashboard**:
   ```
   http://localhost:4000
   ```

3. **Timeline shows**:
   - Scheduled runs (gray cards with countdown)
   - Running runs (blue cards with elapsed time)
   - Completed runs (green cards)
   - Error runs (red cards)

### Filtering by Account

- Use the **AccountFilter** dropdown in the header
- Select an account to filter timeline
- Selection persists in localStorage

### Viewing Run Details

- Click any run card to open `RunDetailsModal`
- Shows:
  - Metrics (profiles processed, creators found, errors)
  - Screenshots
  - Error logs
  - Detected issues
  - Duration and stats

### Adding Scheduled Runs

**Via UI** (future feature):
- Click "Schedule Run" button
- Select profile, script, and time
- Adds to `schedule.config.json`

**Via Config File**:
```bash
# Edit schedule.config.json
nano schedule.config.json

# Add entry to oneOff array
```

**Via API**:
```bash
curl -X POST http://localhost:4000/api/schedule \
  -H "Content-Type: application/json" \
  -d '{
    "profileId": "burner1",
    "scriptName": "discover",
    "scheduledTime": "2025-12-28T14:00:00Z"
  }'
```

---

## 🖥️ VPS Integration (DigitalOcean)

### Prerequisites

- DigitalOcean Droplet (Ubuntu 22.04)
- Node.js 20+ installed
- PM2 installed
- Application deployed

### Step 1: Setup Crontab on VPS

**SSH into your VPS**:
```bash
ssh root@your-droplet-ip
```

**Switch to app user**:
```bash
sudo su - scout
cd scout
```

**Generate crontab entries**:
```bash
# Review the generated crontab first
./scripts/cron/setup_crontab.sh --dry-run

# Install it
./scripts/cron/setup_crontab.sh
```

**Verify installation**:
```bash
crontab -l
```

You should see entries like:
```
15 8 * * * cd /home/scout/scout && ./scripts/cron/schedule.sh burner1 morning
30 15 * * * cd /home/scout/scout && ./scripts/cron/schedule.sh burner1 afternoon
45 20 * * * cd /home/scout/scout && ./scripts/cron/schedule.sh burner1 evening
```

### Step 2: Ensure Schedule Script is Executable

```bash
chmod +x scripts/cron/schedule.sh
chmod +x scripts/cron/smartSessionRunner.ts
```

### Step 3: Configure Timezone

**Set system timezone** (if needed):
```bash
sudo timedatectl set-timezone Europe/London
```

**Update schedule.config.json**:
```json
{
  "timezone": "Europe/London",
  "oneOff": []
}
```

### Step 4: Test Schedule Detection

**Start the server**:
```bash
pm2 start ecosystem.config.js
# or
npm run dev:server
```

**Test API endpoints**:
```bash
# Test cron parsing
curl http://localhost:4000/api/schedule/cron

# Test combined schedule
curl http://localhost:4000/api/schedule
```

**Expected response**:
```json
[
  {
    "id": "scheduled_burner1_morning_...",
    "profileId": "burner1",
    "scriptName": "discover",
    "scheduledTime": "2025-12-29T08:15:00Z",
    "sessionType": "morning",
    "cronPattern": "15 8 * * *"
  }
]
```

### Step 5: Access Dashboard from VPS

**Option A: Direct Access (Development)**
```bash
# On VPS, start server
npm run dev:server

# Access from your local machine
# Use SSH tunnel:
ssh -L 4000:localhost:4000 scout@your-droplet-ip

# Then open: http://localhost:4000
```

**Option B: Nginx Reverse Proxy (Production)**

**Install Nginx**:
```bash
sudo apt install nginx
```

**Create config**:
```bash
sudo nano /etc/nginx/sites-available/scout
```

**Add configuration**:
```nginx
server {
    listen 80;
    server_name your-domain.com;  # or droplet IP

    location / {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }
}
```

**Enable site**:
```bash
sudo ln -s /etc/nginx/sites-available/scout /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

**Add SSL (Optional)**:
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

### Step 6: Monitor Scheduled Runs

**View cron logs**:
```bash
tail -f logs/cron-burner1-$(date +%Y-%m-%d).log
```

**View PM2 logs**:
```bash
pm2 logs scout-server
```

**Check crontab status**:
```bash
# List scheduled jobs
crontab -l

# Check cron service
sudo systemctl status cron
```

**View timeline in dashboard**:
- Open `http://your-domain.com` (or via SSH tunnel)
- Timeline should show scheduled runs from crontab
- Cards update in real-time as runs execute

### Step 7: Troubleshooting Crontab Detection

**Issue: `/api/schedule` returns empty array**

**Check crontab exists**:
```bash
crontab -l
```

**Check cron service**:
```bash
sudo systemctl status cron
sudo systemctl start cron  # if not running
```

**Check file permissions**:
```bash
# Crontab parser tries these paths:
ls -la /var/spool/cron/crontabs/$(whoami)
ls -la ~/.crontab
```

**Test crontab parsing manually**:
```bash
# In Node.js REPL or script
node -e "
const { parseCrontab } = require('./functions/shared/runs/crontabParser.ts');
parseCrontab().then(runs => console.log(runs));
"
```

**Check server logs**:
```bash
pm2 logs scout-server | grep schedule
```

### Step 8: Update Schedule Weekly

**Why**: Avoid detection patterns by varying times

**How**:
1. Edit `scripts/cron/setup_crontab.sh`
2. Change session times (±10-15 minutes)
3. Regenerate crontab:
   ```bash
   ./scripts/cron/setup_crontab.sh
   ```

**Example Week 2**:
```bash
# Week 1: 8:15, 15:30, 20:45
# Week 2: 8:05, 15:45, 21:00
MAIN_MORNING="5 8"
MAIN_AFTERNOON="45 15"
MAIN_EVENING="0 21"
```

---

## 🔧 Troubleshooting

### Timeline Not Showing Scheduled Runs

**Check**:
1. Crontab is installed: `crontab -l`
2. API returns data: `curl http://localhost:4000/api/schedule`
3. Browser console for errors
4. Server logs: `pm2 logs scout-server`

**Fix**:
- Ensure crontab entries match pattern: `* * * * * cd /path && ./scripts/cron/schedule.sh <profile> <session>`
- Check timezone in `schedule.config.json`
- Verify cron service is running: `sudo systemctl status cron`

### Crontab Parser Not Finding Entries

**Check**:
- Crontab format matches expected pattern
- User has permission to read crontab
- Cron service is running

**Fix**:
- Use `setup_crontab.sh` to generate correct format
- Ensure script paths are absolute or relative to project root
- Check file permissions on `schedule.sh`

### Scheduled Runs Not Executing

**Check**:
- Cron service: `sudo systemctl status cron`
- Cron logs: `grep CRON /var/log/syslog`
- Script permissions: `chmod +x scripts/cron/schedule.sh`
- Node.js path in cron: Use full path or `npm` in PATH

**Fix**:
```bash
# In crontab, use full paths or ensure PATH is set
PATH=/usr/local/bin:/usr/bin:/bin
15 8 * * * cd /home/scout/scout && /usr/bin/npm run cron:smart -- --profile burner1 --session morning
```

### WebSocket Not Connecting

**Check**:
- Server is running: `pm2 status`
- Port 4000 is accessible
- Firewall allows WebSocket connections

**Fix**:
- Check PM2 logs: `pm2 logs scout-server`
- Verify WebSocket endpoint: `ws://localhost:4000/ws/runs?runId=...`
- Check firewall: `sudo ufw status`

### Timezone Issues

**Check**:
- System timezone: `timedatectl`
- `schedule.config.json` timezone setting
- UTC conversion in API responses

**Fix**:
```bash
# Set system timezone
sudo timedatectl set-timezone Europe/London

# Update config
{
  "timezone": "Europe/London",
  "oneOff": []
}
```

---

## 📚 Additional Resources

- **Run Tracking**: See `RUNS_TRACKING.md`
- **Deployment**: See `DEPLOYMENT.md`
- **VPS Setup**: See `QUICKSTART_VPS.md`
- **Cron Scripts**: See `scripts/cron/` directory

---

## 🎉 Summary

The schedule system provides:

✅ **Visual Timeline** - See all scheduled, running, and completed runs  
✅ **Real-Time Updates** - WebSocket + polling for live metrics  
✅ **Cron Integration** - Automatic detection of crontab entries  
✅ **One-Off Scheduling** - Config file and API for manual scheduling  
✅ **Issue Detection** - Auto-detect problems in completed runs  
✅ **Account Filtering** - Filter timeline by profile/account  

**VPS Integration**:
1. Setup crontab with `setup_crontab.sh`
2. Ensure scripts are executable
3. Configure timezone
4. Access dashboard via Nginx or SSH tunnel
5. Monitor via PM2 logs and cron logs

The system is production-ready and works seamlessly on DigitalOcean Droplets! 🚀

