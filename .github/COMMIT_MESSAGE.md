# Deployment Overhaul: Docker → VPS

## Changes Made

### Removed
- ❌ Dockerfile - Using remote GoLogin, no Chrome install needed
- ❌ docker-compose.yml - Simpler with PM2

### Added
✅ VPS deployment scripts:
- scripts/deploy/vps-initial-setup.sh - Initial server setup
- scripts/deploy/app-setup.sh - Application installation

✅ Documentation:
- QUICKSTART_VPS.md - 15 min express setup
- VPS_SETUP.md - Detailed walkthrough
- VPS_COMPARISON.md - Hetzner vs DigitalOcean
- DEPLOYMENT.md - All deployment options
- ENV_SETUP.md - Environment variables guide
- MIGRATION_SUMMARY.md - What changed and why

✅ Configuration:
- railway.json - Railway config (kept as option)
- .gitignore - Updated for .env and secrets

### Updated
- README.md - New deployment section, VPS focus
- .github/workflows/deploy.yml - Already had VPS deploy!

## Why?

Docker was overkill because:
1. Using remote GoLogin (no Chrome needed)
2. Using managed Postgres (no container needed)
3. Simple Node.js scripts
4. PM2 handles restarts

VPS deployment is:
- Simpler
- Faster (no image builds)
- Cheaper ($4-6/mo)
- Automation-friendly (no ToS issues)

## Deployment Options

**Recommended: VPS (Hetzner $4/mo or DigitalOcean $6/mo)**
- 15 min setup with automated scripts
- Auto-deploy from GitHub
- No ToS concerns

**Alternative: Railway ($5/mo)**
- Still supported via railway.json
- Not recommended for automation (ToS)

## Quick Start

```bash
# 1. Get VPS (Hetzner or DigitalOcean)
# 2. SSH in
ssh root@YOUR_SERVER_IP

# 3. Run setup
curl -fsSL https://raw.githubusercontent.com/USER/scout/main/scripts/deploy/vps-initial-setup.sh | bash

# 4. Follow prompts
```

See QUICKSTART_VPS.md for full guide.
