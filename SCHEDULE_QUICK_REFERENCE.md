# Schedule System - Quick Reference

## 🎯 What It Does

Visual timeline showing scheduled, running, and completed script executions with real-time updates.

## 🏗️ Architecture (3 Layers)

```
┌─────────────────────────────────────────┐
│  Frontend (TimelineCarousel)            │
│  - Visual timeline with cards           │
│  - Real-time WebSocket updates          │
│  - Account filtering                     │
└─────────────────────────────────────────┘
                    ↕
┌─────────────────────────────────────────┐
│  Backend API (/api/schedule)            │
│  - Combines crontab + config runs       │
│  - Parses system crontab                │
│  - Manages one-off schedules            │
└─────────────────────────────────────────┘
                    ↕
┌─────────────────────────────────────────┐
│  Execution Layer                        │
│  - Crontab entries (recurring)          │
│  - schedule.config.json (one-off)       │
│  - smartSessionRunner.ts (executor)     │
└─────────────────────────────────────────┘
```

## 📁 Key Files

| File | Purpose |
|------|---------|
| `frontend/src/components/TimelineCarousel/` | Timeline UI component |
| `server.ts` (lines 720-814) | Schedule API endpoints |
| `functions/shared/runs/crontabParser.ts` | Parses crontab entries |
| `schedule.config.json` | One-off scheduled runs |
| `scripts/cron/schedule.sh` | Cron wrapper script |
| `scripts/cron/setup_crontab.sh` | Generate crontab entries |

## 🔌 API Endpoints

### `GET /api/schedule`
Returns all scheduled runs (cron + config)

**Response**:
```json
[
  {
    "id": "scheduled_burner1_morning_...",
    "profileId": "burner1",
    "scriptName": "discover",
    "scheduledTime": "2025-12-29T08:15:00Z",
    "sessionType": "morning"
  }
]
```

### `POST /api/schedule`
Add one-off scheduled run

**Request**:
```json
{
  "profileId": "burner1",
  "scriptName": "discover",
  "scheduledTime": "2025-12-28T14:00:00Z"
}
```

## 🚀 Quick Start

### 1. View Timeline
```bash
npm run dev:server
# Open http://localhost:4000
```

### 2. Setup Crontab (VPS)
```bash
./scripts/cron/setup_crontab.sh
crontab -l  # Verify
```

### 3. Add One-Off Run
```bash
# Via config file
nano schedule.config.json

# Via API
curl -X POST http://localhost:4000/api/schedule \
  -H "Content-Type: application/json" \
  -d '{"profileId":"burner1","scriptName":"discover","scheduledTime":"2025-12-28T14:00:00Z"}'
```

## 🖥️ VPS Setup (DigitalOcean)

### Step 1: Install Crontab
```bash
ssh scout@your-droplet-ip
cd scout
./scripts/cron/setup_crontab.sh
```

### Step 2: Verify
```bash
crontab -l
curl http://localhost:4000/api/schedule
```

### Step 3: Access Dashboard
```bash
# Option A: SSH Tunnel
ssh -L 4000:localhost:4000 scout@your-droplet-ip
# Then open http://localhost:4000

# Option B: Nginx (see SCHEDULE_ARCHITECTURE.md)
```

## 🎨 Timeline Card Colors

- 🔵 **Scheduled**: Gray/dashed (countdown timer)
- 🟢 **Running**: Blue/pulsing (elapsed time)
- ✅ **Completed**: Green (checkmark)
- ❌ **Error**: Red (X mark)

## 🔍 Troubleshooting

| Issue | Check | Fix |
|-------|-------|-----|
| No scheduled runs | `crontab -l` | Run `setup_crontab.sh` |
| API returns empty | `curl /api/schedule` | Check cron service: `sudo systemctl status cron` |
| Runs not executing | Cron logs | Check script permissions: `chmod +x scripts/cron/schedule.sh` |
| Timeline not updating | Browser console | Check WebSocket connection, verify server running |

## 📝 Common Commands

```bash
# View crontab
crontab -l

# Edit crontab manually
crontab -e

# View cron logs
tail -f logs/cron-*.log

# Test schedule API
curl http://localhost:4000/api/schedule

# Regenerate crontab
./scripts/cron/setup_crontab.sh

# Check cron service
sudo systemctl status cron
```

## 🔄 Weekly Maintenance

**Vary schedule times weekly** to avoid patterns:

```bash
# Edit setup_crontab.sh
nano scripts/cron/setup_crontab.sh

# Change times (±10-15 min)
MAIN_MORNING="5 8"    # was "15 8"
MAIN_AFTERNOON="45 15" # was "30 15"

# Regenerate
./scripts/cron/setup_crontab.sh
```

## 📚 Full Documentation

See `SCHEDULE_ARCHITECTURE.md` for complete details.

