# VPS Access & Commands Guide

**Server:** `YOUR_SERVER_IP`  
**SSH Access:** `ssh user@YOUR_SERVER_IP`  
**Auth:** Use SSH keys (disable password auth)

---

## 🔐 Quick Access

### SSH Connection

```bash
# Basic SSH connection
ssh user@YOUR_SERVER_IP

# With port forwarding (for dashboard access)
ssh -L 4000:localhost:4000 user@YOUR_SERVER_IP
```

### After Connecting

```bash
# Navigate to Scout directory
cd /root/scout

# One-command status check (PM2 + health + scheduler)
bash scripts/check-vps-status.sh

# Or check manually:
pm2 list
pm2 logs scout --lines 50
```

---

## 📊 Check Scout Status

### PM2 Process Status

```bash
# List all PM2 processes
pm2 list

# Detailed info about Scout
pm2 info scout

# Detailed info about AdsPower
pm2 info adspower

# Real-time monitoring
pm2 monit

# Status overview
pm2 status
```

### API Health Checks

```bash
# Basic health check
curl http://localhost:4000/api/health

# Detailed health status
curl http://localhost:4000/api/health/detailed

# Scheduler status
curl http://localhost:4000/api/scheduler/status

# Proxy usage
curl http://localhost:4000/api/proxy/usage
```

### Process Checks

```bash
# Check if processes are running
ps aux | grep -E "(node|adspower|scout)" | grep -v grep

# Check port 4000 (API server)
ss -tulpn | grep 4000

# Check AdsPower port (50325)
ss -tulpn | grep 50325
```

---

## 🚀 Start/Stop Scout

### Using PM2

```bash
# Start Scout (starts both adspower and scout)
cd /root/scout
pm2 start ecosystem.config.cjs

# Stop Scout
pm2 stop scout
pm2 stop adspower

# Restart Scout
pm2 restart scout
pm2 restart adspower

# Restart all
pm2 restart all

# Delete processes
pm2 delete scout
pm2 delete adspower

# Save current process list
pm2 save

# Setup PM2 to start on boot
pm2 startup
# Then run the command it outputs
```

### Start AdsPower Only

```bash
cd /root/scout
pm2 start ecosystem.config.cjs --only adspower
```

### Start Scout Only (if AdsPower already running)

```bash
cd /root/scout
pm2 start ecosystem.config.cjs --only scout
```

---

## 📝 View Logs

### PM2 Logs

```bash
# View Scout logs (last 100 lines)
pm2 logs scout --lines 100

# Follow Scout logs (real-time)
pm2 logs scout --lines 0

# View AdsPower logs
pm2 logs adspower --lines 100

# View all logs
pm2 logs

# View error logs only
pm2 logs scout --err

# View output logs only
pm2 logs scout --out

# Clear logs
pm2 flush
```

### Log Files

```bash
# Scout logs
tail -f /root/scout/logs/pm2-combined.log
tail -f /root/scout/logs/pm2-error.log
tail -f /root/scout/logs/pm2-out.log

# AdsPower logs
tail -f /root/scout/logs/adspower-error.log
tail -f /root/scout/logs/adspower-out.log

# Search logs for errors
grep -i error /root/scout/logs/pm2-combined.log | tail -20
```

---

## 🔧 Run Manual Commands

### Discovery Sessions

```bash
cd /root/scout

# Run discovery session (no DMs)
npm run discover

# Run discovery with DMs
npm run discover -- --send-dms

# Run discovery for specific profile
npm run discover -- --profile test

# Run discovery with debug logging
npm run discover -- --debug
```

### Scheduler Commands

```bash
cd /root/scout

# Check scheduler status
curl http://localhost:4000/api/scheduler/status | jq

# Generate schedule for today
curl -X POST http://localhost:4000/api/scheduler/generate

# Get next scheduled job
curl http://localhost:4000/api/scheduler/status | jq '.nextJob'
```

### Manual Session Execution

```bash
cd /root/scout

# Run a smart session (morning/afternoon/evening)
npm run cron:smart -- --profile test --session morning

# Run discovery session manually
tsx scripts/discover.ts

# Run discovery with DMs
tsx scripts/discover.ts --send-dms
```

### Profile Management

```bash
cd /root/scout

# List all profiles
npm run profiles:list

# List AdsPower profiles
npm run adspower:list

# Sync profiles from AdsPower
npm run profiles:sync

# Sync profiles (dry run)
npm run profiles:sync:dry
```

### Database Commands

```bash
cd /root/scout

# Open Prisma Studio (database GUI)
npm run studio
# Then access at http://localhost:5555 (if port forwarded)

# Run database migrations
npx prisma migrate deploy

# Generate Prisma client
npx prisma generate

# Check database connection
npx prisma db pull
```

### Health & Monitoring

```bash
cd /root/scout

# Run health check script
npm run health

# Check costs
npm run costs

# View dashboard
npm run dashboard
```

---

## 🔄 Update Scout

### Pull Latest Code

```bash
cd /root/scout

# Pull latest changes
git pull origin main

# Install new dependencies
npm install

# Run database migrations
npx prisma migrate deploy

# Generate Prisma client
npx prisma generate

# Restart Scout
pm2 restart scout
```

### Update Environment Variables

```bash
cd /root/scout

# Edit .env file
nano .env

# After editing, restart Scout
pm2 restart scout
```

---

## 🛠️ Troubleshooting

### Scout Not Starting

```bash
# Check PM2 status
pm2 list

# Check logs for errors
pm2 logs scout --err --lines 50

# Check if port 4000 is in use
ss -tulpn | grep 4000

# Check Node.js version
node --version

# Check if dependencies are installed
cd /root/scout && npm list --depth=0
```

### AdsPower Not Starting

```bash
# Check AdsPower process
pm2 logs adspower --lines 50

# Check if AdsPower binary exists
ls -la /opt/AdsPower\ Global/adspower_global

# Check Xvfb (virtual display)
ps aux | grep Xvfb

# Start Xvfb if not running
Xvfb :99 -screen 0 1024x768x24 &
export DISPLAY=:99
```

### Database Issues

```bash
cd /root/scout

# Check database connection
npx prisma db pull

# Check .env for DATABASE_URL
grep DATABASE_URL .env

# Test database connection
psql $DATABASE_URL -c "SELECT 1;"
```

### Scheduler Not Running

```bash
# Check scheduler status via API
curl http://localhost:4000/api/scheduler/status

# Check if SCHEDULER_ENABLED is set
grep SCHEDULER_ENABLED /root/scout/.env

# Check timezone
grep SCHEDULER_TIMEZONE /root/scout/.env

# Check logs for scheduler errors
pm2 logs scout | grep -i scheduler
```

---

## 🌐 Access Dashboard

### Via SSH Port Forwarding

```bash
# From your local machine
ssh -L 4000:localhost:4000 user@YOUR_SERVER_IP

# Then open in browser
# http://localhost:4000
```

### Direct Access (if firewall allows)

```bash
# Check if API is accessible externally
curl http://YOUR_SERVER_IP:4000/api/health

# Note: API is restricted to localhost for security
# Use SSH port forwarding instead
```

---

## 📋 Quick Reference

### Most Common Commands

```bash
# One-command status check (run after SSH)
cd /root/scout && bash scripts/check-vps-status.sh

# Or check status manually
pm2 list && curl http://localhost:4000/api/health

# View logs
pm2 logs scout --lines 50

# Restart Scout
pm2 restart scout

# Run discovery session
cd /root/scout && npm run discover

# Check scheduler
curl http://localhost:4000/api/scheduler/status | jq
```

### File Locations

| Path | Description |
|------|-------------|
| `/root/scout/` | Main Scout directory |
| `/root/scout/.env` | Environment variables |
| `/root/scout/logs/` | Application logs |
| `/root/scout/profiles.config.json` | Profile configuration |
| `/opt/AdsPower Global/` | AdsPower installation |
| `/root/scout/ecosystem.config.cjs` | PM2 configuration |

### Important Ports

| Port | Service | Access |
|------|---------|--------|
| 4000 | Scout API | localhost only (use SSH tunnel) |
| 50325 | AdsPower API | localhost only |
| 22 | SSH | External (with password/key) |

---

## 🔒 Security Notes

1. **API is restricted to localhost** - Use SSH port forwarding to access
2. **Password authentication** - Consider setting up SSH keys
3. **Firewall** - UFW is active, only SSH (22) is open externally
4. **Fail2ban** - Active, bans IPs after failed login attempts

---

## 📞 Getting Help

If something isn't working:

1. **Check logs**: `pm2 logs scout --lines 100`
2. **Check health**: `curl http://localhost:4000/api/health/detailed`
3. **Check PM2**: `pm2 list` and `pm2 info scout`
4. **Check database**: `npx prisma studio` (if port forwarded)
5. **Review this guide** for the specific command you need

---

**Last Updated:** 2026-01-28
