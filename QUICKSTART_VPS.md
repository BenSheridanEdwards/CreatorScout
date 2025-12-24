# VPS Quick Start (5 Minutes)

**Too long? Here's the express version.**

---

## 🎯 Choose Your VPS

| Provider | Cost | RAM | Why |
|----------|------|-----|-----|
| **[Hetzner](https://hetzner.com/cloud)** | $4/mo | 2GB | ⭐ Best value |
| **[DigitalOcean](https://digitalocean.com)** | $6/mo | 1GB | Better docs |

Both work perfectly. Pick whichever you prefer.

---

## 🚀 Setup Steps

### 1. Create Server (3 min)

**Hetzner:**
- Sign up → Add Server → Ubuntu 22.04 → CX11 ($4/mo) → Add SSH key → Create

**DigitalOcean:**
- Sign up → Create Droplet → Ubuntu 22.04 → Basic $6/mo → Add SSH key → Create

### 2. SSH In

```bash
ssh root@YOUR_SERVER_IP
```

### 3. Run Setup Script (5 min)

```bash
# Download setup script
curl -fsSL https://raw.githubusercontent.com/YOUR_USERNAME/scout/main/scripts/deploy/vps-initial-setup.sh -o setup.sh

# Run it
bash setup.sh
```

**Wait 5 minutes.** Script installs Node.js, PostgreSQL, PM2, creates users, sets up firewall.

**Save the database password** shown at the end!

### 4. Clone & Configure (2 min)

```bash
# Switch to scout user
sudo su - scout

# Clone your repo
git clone https://github.com/YOUR_USERNAME/scout.git scout
cd scout

# Create .env file
nano .env
```

**Paste this** (fill in your real values):

```bash
SMARTPROXY_USERNAME=sp1234567
SMARTPROXY_PASSWORD=your_password
GOLOGIN_API_TOKEN=your_token
INSTAGRAM_USERNAME=your_ig
INSTAGRAM_PASSWORD=your_pass
OPENROUTER_API_KEY=your_key
DATABASE_URL=postgresql://scout:PASSWORD_FROM_SETUP@localhost:5432/scout
LOCAL_BROWSER=false
```

Save: `Ctrl+X`, `Y`, `Enter`

### 5. Setup & Start (3 min)

```bash
# Copy profiles config
cp profiles.config.example.json profiles.config.json
nano profiles.config.json  # Add your GoLogin tokens

# Run app setup
bash scripts/deploy/app-setup.sh
```

**Done!** Your app is now running.

### 6. Enable Auto-Start

The script shows a command like:
```bash
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u scout --hp /home/scout
```

Run it:
```bash
exit  # Exit to root
# Paste the sudo command
sudo su - scout  # Back to scout
```

---

## ✅ Verify It Works

```bash
# Check status
pm2 status

# View logs
pm2 logs scout-server

# Test API
curl http://localhost:4000/api/health

# Should return: {"ok":true,"ts":...}
```

---

## 🤖 Setup Auto-Deploy (3 min)

Make pushes to GitHub auto-deploy!

### 1. Copy Deploy Key

```bash
# As scout user
cat ~/.ssh/id_ed25519
```

Copy the entire output.

### 2. Add GitHub Secrets

Go to: **Your Repo → Settings → Secrets → Actions → New secret**

Add these 4 secrets:

| Name | Value |
|------|-------|
| `VPS_HOST` | Your server IP |
| `VPS_USER` | `scout` |
| `VPS_SSH_KEY` | (paste the key from above) |
| `VPS_PATH` | `/home/scout/scout` |

### 3. Test It

```bash
# On your local machine
git add .
git commit -m "Test deploy"
git push origin main
```

Go to GitHub → Actions tab → Watch it deploy! 🚀

---

## 📊 Daily Commands

```bash
# SSH in
ssh scout@YOUR_SERVER_IP

# View logs
pm2 logs

# Check status
pm2 status

# Restart app
pm2 restart scout-server

# Run a script
npm run discover
```

---

## 🎉 That's It!

Your Scout is now:
- ✅ Running 24/7 on VPS
- ✅ Auto-deploying from GitHub
- ✅ Using GoLogin + SmartProxy
- ✅ Managed by PM2

**Total time:** ~15 minutes  
**Cost:** $4-6/month

---

**Need more detail?** See [VPS_SETUP.md](VPS_SETUP.md) for the complete guide.

**Having issues?** Check [DEPLOYMENT.md](DEPLOYMENT.md) for troubleshooting.

