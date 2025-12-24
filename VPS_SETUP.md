# VPS Setup Guide - Complete Walkthrough

Step-by-step guide to deploy Scout on a VPS (Hetzner, DigitalOcean, Vultr, Linode, etc.)

**Time to complete:** ~20 minutes  
**Cost:** $4-6/month

---

## 📋 Prerequisites

Before starting, have these ready:
- ✅ AdsPower installed + Local API enabled
- ✅ SmartProxy credentials
- ✅ Instagram login credentials
- ✅ OpenRouter API key
- ✅ Your GitHub repo cloned/forked

---

## 🎯 Option A: Hetzner Cloud (Recommended - $4/mo)

### Step 1: Create Hetzner Account

1. Go to [hetzner.com/cloud](https://www.hetzner.com/cloud)
2. Click "Sign Up" and create account
3. Verify email and add payment method

### Step 2: Create Server

1. Click "Add Server"
2. **Location:** Choose closest to you (Falkenstein/Germany, Helsinki, or Ashburn/USA)
3. **Image:** Ubuntu 22.04
4. **Type:** Shared vCPU
5. **Server:** CX11 (2GB RAM) - **€3.79/month (~$4/mo)**
6. **SSH Key:** Click "Add SSH Key"
   - On your Mac: `cat ~/.ssh/id_rsa.pub` (copy the output)
   - Paste into Hetzner
   - Name it "My Mac"
7. **Server Name:** `scout-production`
8. Click "Create & Buy Now"

**Server will be ready in ~30 seconds!**

### Step 3: Get Your Server IP

Copy the IP address shown (e.g., `167.99.123.45`)

---

## 🎯 Option B: DigitalOcean ($6/mo)

### Step 1: Create DigitalOcean Account

1. Go to [digitalocean.com](https://www.digitalocean.com)
2. Sign up (you might get $200 free credit!)
3. Verify email and add payment method

### Step 2: Create Droplet

1. Click "Create" → "Droplets"
2. **Choose Region:** Closest to you (NYC, SF, Amsterdam, etc.)
3. **Choose Image:** Ubuntu 22.04 LTS
4. **Choose Size:** Basic
5. **CPU Options:** Regular
6. **Select Plan:** $6/month (1GB RAM, 1 vCPU, 25GB SSD)
7. **Authentication:** SSH Keys
   - Click "New SSH Key"
   - On your Mac: `cat ~/.ssh/id_rsa.pub` (copy output)
   - Paste and name it "My Mac"
8. **Hostname:** `scout-production`
9. Click "Create Droplet"

**Droplet will be ready in ~1 minute!**

### Step 3: Get Your Droplet IP

Copy the IP address shown (e.g., `138.68.123.45`)

---

## 🚀 Initial VPS Setup (Both Hetzner & DigitalOcean)

### Step 1: SSH Into Your Server

```bash
# Replace with your server IP
ssh root@YOUR_SERVER_IP

# If prompted about authenticity, type: yes
```

You're now connected to your VPS! 🎉

### Step 2: Run Initial Setup Script

```bash
# Download and run the setup script
curl -fsSL https://raw.githubusercontent.com/YOUR_USERNAME/scout/main/scripts/deploy/vps-initial-setup.sh -o setup.sh

# Or if you haven't pushed to GitHub yet, paste the script manually:
nano setup.sh
# (paste content from scripts/deploy/vps-initial-setup.sh)
# Press Ctrl+X, then Y, then Enter to save

# Make executable and run
chmod +x setup.sh
bash setup.sh
```

**This will take 3-5 minutes** and install:
- Node.js 20
- PostgreSQL
- PM2
- Git
- Create 'scout' user
- Setup database
- Configure firewall
- Generate SSH keys

### Step 3: Save Database Password

The script will output something like:
```
📝 Database credentials:
   Username: scout
   Password: abc123xyz789...
   Connection string: postgresql://scout:abc123xyz789...@localhost:5432/scout

⚠️  SAVE THESE CREDENTIALS!
```

**Copy the connection string** - you'll need it for your `.env` file!

### Step 4: Copy GitHub Deploy Key

```bash
# Still as root, switch to scout user
sudo su - scout

# Display the private key
cat ~/.ssh/id_ed25519
```

**Copy this entire key** (including `-----BEGIN` and `-----END` lines).  
You'll add this to GitHub secrets later.

---

## 📦 Application Setup

### Step 1: Clone Your Repository

```bash
# You should be logged in as 'scout' user
# If not: sudo su - scout

# Clone your repo
git clone https://github.com/YOUR_USERNAME/scout.git scout
cd scout
```

### Step 2: Create .env File

```bash
nano .env
```

Paste this and **fill in your real values**:

```bash
# ===========================================
# SMARTPROXY CONFIGURATION
# ===========================================
SMARTPROXY_USERNAME=sp1234567
SMARTPROXY_PASSWORD=your_actual_password
SMARTPROXY_HOST=gate.smartproxy.com
SMARTPROXY_PORT=7000

# ===========================================
# ADSPOWER CONFIGURATION
# ===========================================
ADSPOWER_API_BASE=http://127.0.0.1:50325

# ===========================================
# INSTAGRAM CREDENTIALS
# ===========================================
INSTAGRAM_USERNAME=your_ig_username
INSTAGRAM_PASSWORD=your_ig_password

# ===========================================
# AI & VISION API
# ===========================================
OPENROUTER_API_KEY=your_actual_openrouter_key

# ===========================================
# DATABASE (paste the connection string from setup)
# ===========================================
DATABASE_URL=postgresql://scout:THE_PASSWORD_FROM_SETUP@localhost:5432/scout

# ===========================================
# DEVELOPMENT FLAGS
# ===========================================
LOCAL_BROWSER=false
DEBUG_LOGS=false
```

**Save:** Press `Ctrl+X`, then `Y`, then `Enter`

### Step 3: Setup Profiles Configuration

```bash
# Copy example
cp profiles.config.example.json profiles.config.json

# Edit with your GoLogin tokens
nano profiles.config.json
```

Update the `goLoginToken` fields with your actual tokens from GoLogin dashboard.

**Save:** `Ctrl+X`, `Y`, `Enter`

### Step 4: Run Application Setup

```bash
# Run the app setup script
bash scripts/deploy/app-setup.sh
```

This will:
- Install npm dependencies
- Generate Prisma client
- Run database migrations
- Create necessary directories
- Start the app with PM2

### Step 5: Enable PM2 Startup

The script will show a command like:

```bash
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u scout --hp /home/scout
```

**Exit to root user and run it:**

```bash
# Exit scout user
exit

# Run the sudo command shown above
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u scout --hp /home/scout

# Switch back to scout
sudo su - scout
```

---

## ✅ Verify Everything Works

### 1. Check PM2 Status

```bash
pm2 status
```

You should see `scout-server` running in `online` status.

### 2. Check Logs

```bash
pm2 logs scout-server
```

Look for "Server listening on port 4000" or similar success messages.

### 3. Test API

```bash
curl http://localhost:4000/api/health
```

Should return: `{"ok":true,"ts":...}`

### 4. Run Health Check

```bash
npm run health
```

Should show all systems operational.

---

## 🤖 Setup GitHub Auto-Deploy

Now let's make it so every push to `main` automatically deploys!

### Step 1: Add GitHub Secrets

1. Go to your GitHub repo
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **"New repository secret"** and add these:

| Name | Value |
|------|-------|
| `VPS_HOST` | Your server IP (e.g., `167.99.123.45`) |
| `VPS_USER` | `scout` |
| `VPS_SSH_KEY` | The private key from `~/.ssh/id_ed25519` (entire content) |
| `VPS_PATH` | `/home/scout/scout` |

### Step 2: Test Auto-Deploy

```bash
# On your local machine
cd /path/to/scout
git add .
git commit -m "Test auto-deploy"
git push origin main
```

Go to GitHub → Your Repo → **Actions** tab.  
You should see the workflow running!

When it completes:
- Tests pass ✅
- Deploys to VPS ✅
- Restarts PM2 ✅

---

## 🔧 Optional: Setup Cron Jobs

For scheduled sessions:

```bash
# As scout user
crontab -e

# Choose editor (nano is easiest - option 1)
# Add these lines:

# Run sessions at 9am, 3pm, 9pm daily
0 9,15,21 * * * cd /home/scout/scout && npm run cron:session >> logs/cron.log 2>&1

# Reset daily counters at midnight
0 0 * * * cd /home/scout/scout && npm run cron:reset >> logs/cron.log 2>&1
```

**Save:** `Ctrl+X`, `Y`, `Enter`

---

## 📊 Useful Commands

### PM2 Management

```bash
pm2 status              # Show status
pm2 logs scout-server   # View logs (live)
pm2 restart scout-server # Restart app
pm2 stop scout-server   # Stop app
pm2 start ecosystem.config.js # Start app
pm2 monit              # Real-time monitoring
```

### View Logs

```bash
pm2 logs                    # All PM2 logs
tail -f logs/scout-*.log    # Application logs
tail -f logs/cron.log       # Cron job logs
```

### Database Management

```bash
npx prisma studio           # Open GUI (port 5555)
psql -U scout -d scout      # SQL console
npx prisma migrate deploy   # Run migrations
```

### Manual Script Runs

```bash
npm run discover            # Test discovery
npm run health             # Health check
npm run dashboard          # View metrics
npm run test:profile main1 # Test a profile
```

### Update Application

```bash
# Auto-deployed via GitHub Actions, or manually:
cd /home/scout/scout
git pull origin main
npm install
npx prisma migrate deploy
pm2 restart scout-server
```

---

## 🚨 Troubleshooting

### "Can't connect to database"

```bash
# Check PostgreSQL is running
sudo systemctl status postgresql

# Check DATABASE_URL in .env
cat .env | grep DATABASE_URL

# Test connection
psql -U scout -d scout -h localhost
```

### "PM2 shows 'errored' status"

```bash
# View error logs
pm2 logs scout-server --err

# Common fixes:
pm2 delete all
cd /home/scout/scout
npm install
pm2 start ecosystem.config.js
```

### "GitHub Actions deploy fails"

- Check VPS_SSH_KEY secret has the FULL private key (including BEGIN/END lines)
- Verify VPS_HOST is the correct IP
- Make sure scout user exists and has SSH key setup
- Check firewall allows SSH: `sudo ufw status`

### "Port 4000 not accessible externally"

```bash
# Check firewall
sudo ufw allow 4000/tcp
sudo ufw reload

# Check app is running
pm2 status
curl http://localhost:4000/api/health
```

---

## 💰 Cost Summary

### Hetzner (Recommended)
- **CX11:** €3.79/month (~$4/mo)
- **Includes:** 2GB RAM, 20GB SSD, 20TB traffic
- **Total first month:** ~$4

### DigitalOcean
- **Basic Droplet:** $6/month
- **Includes:** 1GB RAM, 25GB SSD, 1TB traffic
- **Total first month:** $6 (or $0 with credits)

### Running Costs
- VPS: $4-6/mo
- AdsPower: $9/mo base
- SmartProxy: $12.5/GB (~$125-625/mo depending on usage)
- OpenRouter: $10-30/mo
- **Total:** ~$190-700/mo

---

## 🎉 You're Done!

Your Scout is now:
- ✅ Running 24/7 on a VPS
- ✅ Auto-deploying on every git push
- ✅ Backed by PostgreSQL
- ✅ Managed by PM2 (auto-restart on crash)
- ✅ Using AdsPower + SmartProxy for safety

### Quick Links
- **Server:** `ssh scout@YOUR_SERVER_IP`
- **Logs:** `pm2 logs`
- **Status:** `pm2 status`
- **GitHub Actions:** https://github.com/YOUR_USERNAME/scout/actions

Need help? Check [DEPLOYMENT.md](DEPLOYMENT.md) or [README.md](README.md)!

---

**Happy scraping! 🚀**

