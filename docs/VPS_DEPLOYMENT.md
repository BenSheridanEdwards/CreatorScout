# Scout VPS Deployment Guide

This guide explains how to deploy Scout to a VPS for automated Instagram session management.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [VPS Recommendations](#vps-recommendations)
3. [Quick Setup](#quick-setup)
4. [Manual Setup](#manual-setup)
5. [Configuration](#configuration)
6. [Proxy Optimization](#proxy-optimization)
7. [Monitoring](#monitoring)
8. [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before deploying, ensure you have:

- [ ] A VPS with Ubuntu 22.04+ (2GB RAM minimum, 4GB recommended)
- [ ] Domain name (optional, for HTTPS)
- [ ] SSH access to your VPS
- [ ] Residential proxy credentials (Decodo or Smartproxy)
- [ ] OpenAI API key for bio analysis
- [ ] AdsPower profiles set up (or local browser for testing)

---

## VPS Recommendations

### Provider Options

| Provider | Min Plan | Monthly Cost | Notes |
|----------|----------|--------------|-------|
| **Hetzner** | CX21 | ~€5 | Best value, EU locations |
| **DigitalOcean** | Basic 2GB | $12 | Good docs, easy setup |
| **Vultr** | Cloud Compute | $10 | Global locations |
| **Linode** | Nanode 1GB | $5 | 1GB might be tight |

### Recommended Specs

- **CPU**: 2 vCPU (Chrome is CPU-heavy)
- **RAM**: 4GB (2GB minimum)
- **Storage**: 40GB SSD
- **Location**: Match your proxy geolocation (e.g., UK for UK proxy)

---

## Quick Setup

### Option 1: Automated Script

```bash
# SSH into your VPS
ssh root@your-vps-ip

# Download and run setup script
curl -fsSL https://raw.githubusercontent.com/your-repo/scout/main/scripts/deploy/vps-setup.sh | bash
```

### Option 2: Docker (Recommended)

```bash
# SSH into your VPS
ssh root@your-vps-ip

# Install Docker
curl -fsSL https://get.docker.com | sh

# Clone your repo
git clone https://github.com/your-repo/scout.git /opt/scout
cd /opt/scout

# Configure environment
cp docs/env.example.txt .env
nano .env  # Fill in your credentials

# Start with Docker Compose
docker-compose up -d

# Check logs
docker-compose logs -f scout
```

---

## Manual Setup

### Step 1: Connect to Your VPS

```bash
# From your local machine
ssh root@your-vps-ip

# Or with a key
ssh -i ~/.ssh/your_key root@your-vps-ip
```

### Step 2: Install Dependencies

```bash
# Update system
apt update && apt upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Install Chromium dependencies
apt install -y chromium-browser fonts-liberation libgbm1 libnss3 \
  libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxcomposite1 \
  libxdamage1 libxrandr2 libpango-1.0-0 libcairo2 libasound2

# Install PM2 for process management
npm install -g pm2 tsx
```

### Step 3: Clone and Configure

```bash
# Create scout user
useradd -m -s /bin/bash scout
su - scout

# Clone repo
git clone https://github.com/your-repo/scout.git /home/scout/scout
cd /home/scout/scout

# Install dependencies
npm install

# Configure environment
cp docs/env.example.txt .env
nano .env  # Fill in your credentials
```

### Step 4: Database Setup

```bash
# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate deploy
```

### Step 5: Start Scout

```bash
# Using PM2 (recommended)
pm2 start ecosystem.config.js
pm2 save
pm2 startup  # Follow the instructions

# Or using systemd (see vps-setup.sh for service file)
sudo systemctl enable scout
sudo systemctl start scout
```

### Step 6: Verify

```bash
# Check status
pm2 status

# Check health
curl http://localhost:4000/api/health

# Check detailed health
curl http://localhost:4000/api/health/detailed

# Check scheduler status
curl http://localhost:4000/api/scheduler/status

# View logs
pm2 logs scout
```

---

## Configuration

### Environment Variables

Key settings in your `.env` file:

```bash
# Database (PostgreSQL recommended for VPS)
DATABASE_URL="postgresql://scout:password@localhost:5432/scout"

# Proxy (IMPORTANT: This costs money!)
DECODO_USERNAME="your_username"
DECODO_PASSWORD="your_password"

# Scheduler
SCHEDULER_ENABLED="true"
SCHEDULER_TIMEZONE="Europe/London"

# OpenAI
OPENAI_API_KEY="sk-..."
```

### Timezone Configuration

The scheduler uses your configured timezone. Make sure:

1. Set `SCHEDULER_TIMEZONE` in `.env`
2. Set VPS system timezone:
   ```bash
   timedatectl set-timezone Europe/London
   ```

### Profile Configuration

Edit `profiles.config.json` to configure your Instagram profiles:

```json
{
  "profiles": [
    {
      "id": "main-account",
      "username": "your_username",
      "type": "main",
      "adsPowerProfileId": "abc123",
      "sessions": {
        "morning": { "enabled": true },
        "afternoon": { "enabled": true },
        "evening": { "enabled": true }
      }
    }
  ]
}
```

---

## Proxy Optimization

### Why This Matters

Residential proxies cost **$8-12 per GB**. An unoptimized session can use **150MB+**, while optimized sessions use **30-50MB**.

### Cost Estimates

| Sessions/Day | Unoptimized | Optimized | Monthly Savings |
|--------------|-------------|-----------|-----------------|
| 3            | ~450MB/day  | ~120MB/day| ~$100/month     |
| 9 (3 profiles) | ~1.35GB/day | ~360MB/day | ~$300/month   |

### Built-in Optimization

Scout automatically:

1. **Blocks unnecessary resources** (images, videos, fonts)
2. **Caches browser sessions** to reduce re-authentication
3. **Uses sticky sessions** (20-30 min) to maintain IP consistency
4. **Pre-validates sessions** before connecting proxy

### Monitoring Proxy Usage

```bash
# Check today's usage
curl http://localhost:4000/api/proxy/usage

# Response:
{
  "today": {
    "totalMB": 45.2,
    "totalRequests": 892,
    "estimatedCost": 0.45
  },
  "monthly": {
    "currentMonthMB": 1250,
    "projectedMonthMB": 3750,
    "projectedCost": 37.50
  }
}
```

### Reducing Bandwidth Further

1. **Reduce sessions per day**: 2 instead of 3
2. **Shorten session duration**: 12-15 min instead of 15-20
3. **Disable debug screenshots**: Set `DEBUG_SCREENSHOTS=false`
4. **Use aggressive blocking**: Already enabled by default

---

## Monitoring

### Health Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/health` | Basic health check |
| `GET /api/health/detailed` | Full health status with alerts |
| `GET /api/scheduler/status` | Scheduler and job status |
| `GET /api/proxy/usage` | Proxy bandwidth tracking |

### Setting Up Alerts

Add a Discord/Slack webhook for alerts:

```typescript
// In your startup script
import { startHealthMonitoring } from './functions/shared/health/healthMonitor';

startHealthMonitoring(5, 'https://discord.com/api/webhooks/...');
```

### PM2 Monitoring

```bash
# Real-time dashboard
pm2 monit

# Status overview
pm2 status

# Logs
pm2 logs scout --lines 100

# Restart if needed
pm2 restart scout
```

### External Monitoring

Consider using:

- **UptimeRobot** (free): Monitor `/api/health`
- **Betterstack** (free tier): Logs + monitoring
- **Grafana Cloud** (free tier): Dashboards

---

## Troubleshooting

### Common Issues

#### 1. Chromium Won't Start

```bash
# Check if Chromium is installed
which chromium-browser

# Test it manually
chromium-browser --headless --no-sandbox --dump-dom https://google.com

# If missing, install:
apt install -y chromium-browser
```

#### 2. Session Failures

```bash
# Check logs
pm2 logs scout | grep -i error

# Check scheduler status
curl http://localhost:4000/api/scheduler/status | jq

# Force run a session manually
cd /opt/scout
npm run cron:smart -- --profile main-account --session morning
```

#### 3. Proxy Connection Failed

```bash
# Test proxy directly
curl -x http://user:pass@dc.decodo.com:10000 https://api.ipify.org

# Check proxy credentials in .env
grep DECODO .env

# Check proxy usage logs
tail -100 logs/scout-*.log | grep PROXY
```

#### 4. Database Errors

```bash
# Check connection
npx prisma db pull

# Reset if needed (WARNING: deletes data)
npx prisma migrate reset

# Run migrations
npx prisma migrate deploy
```

#### 5. High Memory Usage

```bash
# Check memory
free -m

# Check Scout process
pm2 monit

# Restart to clear memory
pm2 restart scout
```

### Getting Help

1. Check logs: `pm2 logs scout --lines 200`
2. Check health: `curl http://localhost:4000/api/health/detailed`
3. Review screenshots in `/opt/scout/screenshots/`
4. Check database: `npx prisma studio`

---

## Security Best Practices

1. **Use UFW firewall**:
   ```bash
   ufw allow ssh
   ufw allow 4000/tcp
   ufw enable
   ```

2. **Use fail2ban** (installed by setup script)

3. **Don't run as root**: Use the `scout` user

4. **Keep secrets in `.env`**: Never commit to git

5. **Use SSH keys**: Disable password authentication

6. **Regular updates**:
   ```bash
   apt update && apt upgrade -y
   ```

---

## Updating Scout

```bash
# SSH to VPS
ssh scout@your-vps-ip

# Navigate to Scout
cd /opt/scout

# Pull latest changes
git pull origin main

# Install new dependencies
npm install

# Run migrations
npx prisma migrate deploy

# Restart
pm2 restart scout
```

---

## Quick Reference

### Start/Stop Commands

```bash
pm2 start scout       # Start
pm2 stop scout        # Stop
pm2 restart scout     # Restart
pm2 delete scout      # Remove
pm2 logs scout        # View logs
```

### Useful Endpoints

```bash
# Health
curl localhost:4000/api/health
curl localhost:4000/api/health/detailed

# Scheduler
curl localhost:4000/api/scheduler/status

# Proxy
curl localhost:4000/api/proxy/usage

# Stats
curl localhost:4000/api/stats
```

### File Locations

| Path | Description |
|------|-------------|
| `/opt/scout/.env` | Environment config |
| `/opt/scout/profiles.config.json` | Profile config |
| `/opt/scout/logs/` | Application logs |
| `/opt/scout/screenshots/` | Session screenshots |
| `/opt/scout/scout.db` | SQLite database |
