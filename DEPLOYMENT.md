# Scout Deployment Guide

Simple deployment without Docker - using Railway + PM2 + managed Postgres.

## Why No Docker?

- ✅ **GoLogin = remote browsers** (no Chrome install needed)
- ✅ **Managed Postgres** (Railway/Supabase - no container needed)
- ✅ **Simple Node.js scripts** (just `npm run` commands)
- ✅ **PM2 handles restarts** (no need for Docker restart policies)

---

## 🚀 Option 1: Railway (Recommended - Easiest)

**Perfect for:** Production deployment with zero configuration

### Step 1: Setup Railway Account

1. Go to [railway.app](https://railway.app) and sign up
2. Install Railway CLI (optional):
   ```bash
   npm install -g @railway/cli
   railway login
   ```

### Step 2: Create Project

**Via Dashboard:**
1. Click "New Project"
2. Choose "Deploy from GitHub repo"
3. Select your Scout repository
4. Railway auto-detects Node.js and uses `railway.json` config

**Via CLI:**
```bash
railway init
railway link
```

### Step 3: Add Postgres Database

1. In Railway dashboard, click "New" → "Database" → "Add PostgreSQL"
2. Railway automatically creates `DATABASE_URL` environment variable
3. Your app can access it as `process.env.DATABASE_URL`

### Step 4: Set Environment Variables

In Railway dashboard → Variables tab, add:

```bash
# Required
GOLOGIN_API_TOKEN=your-gologin-token
SMARTPROXY_USERNAME=sp1234567
SMARTPROXY_PASSWORD=your-password
INSTAGRAM_USERNAME=your-ig-username
INSTAGRAM_PASSWORD=your-ig-password
OPENROUTER_API_KEY=your-openrouter-key

# Optional (use defaults if not set)
SMARTPROXY_HOST=gate.smartproxy.com
SMARTPROXY_PORT=7000
GOLOGIN_USE_LOCAL=false
LOCAL_BROWSER=false
DEBUG_LOGS=false
```

**Important:** Railway automatically provides `DATABASE_URL` from the Postgres plugin - don't manually set it!

### Step 5: Deploy

```bash
# Push to GitHub (if using GitHub integration)
git push origin main
# Railway auto-deploys on every push

# Or deploy directly via CLI
railway up
```

### Step 6: Run Database Migrations

Railway runs `npx prisma migrate deploy` automatically on startup (see `railway.json`).

To manually run migrations:
```bash
railway run npx prisma migrate deploy
```

### Step 7: Monitor & Manage

```bash
# View logs
railway logs

# Open Prisma Studio
railway run npx prisma studio

# Run scripts manually
railway run npm run discover
railway run npm run cron:session
```

### Step 8: Setup Cron Jobs

Railway doesn't have built-in cron, so use Railway Cron Service or external scheduler:

**Option A: Railway Cron Service** (separate service)
1. Create new service in same project
2. Set start command: `node -e "setInterval(() => require('child_process').exec('npm run cron:session'), 6*60*60*1000)"`

**Option B: External Cron (EasyCron, cron-job.org)**
1. Create account at easycron.com (free)
2. Add job: `curl -X POST https://your-app.railway.app/api/trigger-session`
3. Schedule: `0 9,15,21 * * *` (9am, 3pm, 9pm)

**Option C: GitHub Actions** (free)
```yaml
# .github/workflows/cron.yml
name: Run Scout Session
on:
  schedule:
    - cron: '0 9,15,21 * * *'  # 9am, 3pm, 9pm UTC
  workflow_dispatch:  # Allow manual trigger
jobs:
  run-session:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: npm install
      - run: npm run cron:session
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          GOLOGIN_API_TOKEN: ${{ secrets.GOLOGIN_API_TOKEN }}
          SMARTPROXY_USERNAME: ${{ secrets.SMARTPROXY_USERNAME }}
          SMARTPROXY_PASSWORD: ${{ secrets.SMARTPROXY_PASSWORD }}
          INSTAGRAM_USERNAME: ${{ secrets.INSTAGRAM_USERNAME }}
          INSTAGRAM_PASSWORD: ${{ secrets.INSTAGRAM_PASSWORD }}
          OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
```

### Railway Costs

- **Starter Plan**: $5/month (500 hours, 8GB RAM)
- **Postgres**: $5/month (included in starter)
- **Total**: ~$5-10/month

---

## 🖥️ Option 2: VPS Deployment (DigitalOcean, Linode, Hetzner)

**Perfect for:** Maximum control, lower cost for 24/7 operation

### Step 1: Get a VPS

**DigitalOcean Droplet** ($6/month):
- 1 GB RAM / 1 vCPU
- 25 GB SSD
- Ubuntu 22.04

**Hetzner Cloud** ($4/month - cheaper!):
- 2 GB RAM / 1 vCPU  
- 20 GB SSD
- Ubuntu 22.04

### Step 2: Initial Server Setup

```bash
# SSH into your VPS
ssh root@your-server-ip

# Update system
apt update && apt upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Install PM2 globally
npm install -g pm2

# Install PostgreSQL (or use managed DB)
apt install -y postgresql postgresql-contrib
sudo -u postgres psql
CREATE DATABASE scout;
CREATE USER scout WITH ENCRYPTED PASSWORD 'your-password';
GRANT ALL PRIVILEGES ON DATABASE scout TO scout;
\q
```

### Step 3: Deploy Application

```bash
# Create app user (security)
adduser scout
usermod -aG sudo scout
su - scout

# Clone repository
git clone https://github.com/your-username/scout.git
cd scout

# Install dependencies
npm install

# Create .env file
cp .env.example .env
nano .env  # Edit with your credentials
```

### Step 4: Setup Database

```bash
# Run migrations
npx prisma migrate deploy

# Verify connection
npx prisma studio  # Opens on localhost:5555
```

### Step 5: Start with PM2

```bash
# Start application
pm2 start ecosystem.config.js

# Save PM2 process list
pm2 save

# Setup PM2 to start on boot
pm2 startup
# Copy and run the command it outputs

# Monitor
pm2 status
pm2 logs scout-server
pm2 monit
```

### Step 6: Setup Cron Jobs

```bash
# Edit crontab
crontab -e

# Add scheduled sessions (9am, 3pm, 9pm daily)
0 9,15,21 * * * cd /home/scout/scout && /usr/bin/npm run cron:session >> /home/scout/scout/logs/cron.log 2>&1

# Add daily counter reset (midnight)
0 0 * * * cd /home/scout/scout && /usr/bin/npm run cron:reset >> /home/scout/scout/logs/cron.log 2>&1
```

### Step 7: Setup Nginx (Optional - for web dashboard)

```bash
# Install Nginx
sudo apt install -y nginx

# Configure reverse proxy
sudo nano /etc/nginx/sites-available/scout

# Add:
server {
    listen 80;
    server_name your-domain.com;
    
    location / {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}

# Enable site
sudo ln -s /etc/nginx/sites-available/scout /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

# Optional: Add SSL with Let's Encrypt
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

### Step 8: Monitoring & Updates

```bash
# View logs
pm2 logs scout-server
tail -f logs/scout-*.log

# Update application
cd /home/scout/scout
git pull
npm install
npx prisma migrate deploy
pm2 restart scout-server

# Health check
curl http://localhost:4000/api/health
```

---

## 💻 Option 3: Local Development

**Perfect for:** Testing and development

### Setup

```bash
# Clone and install
git clone your-repo
cd scout
npm install

# Create .env from example
cp .env.example .env
# Edit .env with your credentials

# Setup local database
# Option A: Use Railway/Supabase managed DB (easiest)
# Option B: Install Postgres locally
brew install postgresql  # macOS
brew services start postgresql
createdb scout

# Run migrations
npx prisma migrate deploy
```

### Running Scripts

```bash
# Test individual scripts
npm run analyze some_username
npm run follow test_user
npm run dm test_user

# Run discovery
npm run discover

# Run full scraper
npm run cron:session

# View dashboard
npm run dashboard

# Run with PM2 (background)
pm2 start ecosystem.config.js
pm2 logs
```

---

## 🔧 Configuration Files

### `ecosystem.config.js` (PM2 Configuration)

Already configured! Just run:
```bash
pm2 start ecosystem.config.js
```

### `railway.json` (Railway Configuration)

Already configured! Railway auto-uses this.

### `profiles.config.json` (Multi-Account Setup)

```bash
# Copy example
cp profiles.config.example.json profiles.config.json

# Edit with your GoLogin tokens and Instagram accounts
nano profiles.config.json
```

---

## 📊 Monitoring & Debugging

### View Logs

**Railway:**
```bash
railway logs
railway logs --follow
```

**VPS with PM2:**
```bash
pm2 logs scout-server
pm2 logs --lines 100
tail -f logs/scout-*.log
```

### Database Management

**Prisma Studio** (GUI):
```bash
# Railway
railway run npx prisma studio

# VPS
npx prisma studio
# Opens on http://localhost:5555
```

**Direct SQL:**
```bash
# Railway
railway run psql

# VPS
psql -U scout -d scout
```

### Health Checks

```bash
# Check if server is running
curl http://localhost:4000/api/health

# Check browser connection
curl http://localhost:4000/api/env/connection

# View metrics
npm run dashboard
```

---

## 🚨 Troubleshooting

### "Cannot connect to database"

**Railway:**
```bash
# Check DATABASE_URL is set
railway variables
# Should show DATABASE_URL from Postgres plugin
```

**VPS:**
```bash
# Check Postgres is running
sudo systemctl status postgresql

# Test connection
psql -U scout -d scout -h localhost
```

### "GoLogin connection failed"

```bash
# Verify token in .env
echo $GOLOGIN_API_TOKEN

# Test connection
npm run test:profile your-profile-id

# Check GoLogin dashboard - is profile running elsewhere?
```

### "Proxy authentication failed"

```bash
# Test SmartProxy credentials
curl -x gate.smartproxy.com:7000 \
  -U "user-sp1234567-session-test:YOUR_PASSWORD" \
  https://ip.smartproxy.com

# Should return your proxy IP
```

### PM2 Process Crashes

```bash
# View error logs
pm2 logs scout-server --err

# Restart with fresh state
pm2 delete all
pm2 start ecosystem.config.js

# Check memory usage
pm2 monit
```

---

## 🔄 Updating/Redeploying

### Railway
```bash
# Push to GitHub
git push origin main
# Auto-deploys!

# Or manually
railway up
```

### VPS
```bash
ssh your-server
cd /home/scout/scout
git pull
npm install
npx prisma migrate deploy
pm2 restart scout-server
```

---

## 💰 Cost Comparison

| Option | Monthly Cost | Pros | Cons |
|--------|--------------|------|------|
| **Railway** | $5-10 | Zero config, auto-deploy, managed DB | Slight vendor lock-in |
| **VPS (DigitalOcean)** | $6 + $0 DB | Full control, cheaper long-term | Manual setup, maintenance |
| **VPS (Hetzner)** | $4 + $0 DB | Cheapest option | EU-based servers only |
| **Local Mac/PC** | $0 | Free, easy testing | Must stay running 24/7 |

**Recommended:** Start with Railway for simplicity, move to VPS if you need more control or lower costs.

---

## 📝 Quick Start Summary

### Railway (Fastest)
```bash
# 1. Push to GitHub
git push origin main

# 2. Railway dashboard:
#    - New Project → GitHub repo
#    - Add PostgreSQL plugin
#    - Set environment variables
#    - Deploy!

# 3. Done! Auto-deploys on every git push
```

### VPS (Most Control)
```bash
# 1. Get Ubuntu VPS
# 2. Install Node.js 20 + PM2
# 3. Clone repo, npm install, setup .env
# 4. npx prisma migrate deploy
# 5. pm2 start ecosystem.config.js
# 6. Setup cron jobs
```

---

Need help? Check the [main README](README.md) or open an issue!

