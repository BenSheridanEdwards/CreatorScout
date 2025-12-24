#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# Scout VPS Initial Setup Script
# ═══════════════════════════════════════════════════════════════════════════════
#
# Run this script on a fresh Ubuntu 22.04 VPS to set up Scout.
# Works on: Hetzner, DigitalOcean, Vultr, Linode, etc.
#
# Usage:
#   1. SSH into your VPS as root
#   2. curl -fsSL https://raw.githubusercontent.com/YOUR_USER/scout/main/scripts/deploy/vps-initial-setup.sh | bash
#   OR
#   3. Copy this file to VPS and run: bash vps-initial-setup.sh
#
# ═══════════════════════════════════════════════════════════════════════════════

set -e  # Exit on error

echo "════════════════════════════════════════════════════════════════════════════════"
echo "  Scout VPS Setup - Ubuntu 22.04"
echo "════════════════════════════════════════════════════════════════════════════════"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo "❌ Please run as root (or use sudo)"
    exit 1
fi

# ═══════════════════════════════════════════════════════════════════════════════
# 1. System Update
# ═══════════════════════════════════════════════════════════════════════════════
echo "📦 Updating system packages..."
apt-get update -qq
apt-get upgrade -y -qq
echo "✅ System updated"
echo ""

# ═══════════════════════════════════════════════════════════════════════════════
# 2. Install Node.js 20
# ═══════════════════════════════════════════════════════════════════════════════
echo "📦 Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
echo "✅ Node.js $(node --version) installed"
echo "✅ npm $(npm --version) installed"
echo ""

# ═══════════════════════════════════════════════════════════════════════════════
# 3. Install PostgreSQL
# ═══════════════════════════════════════════════════════════════════════════════
echo "📦 Installing PostgreSQL..."
apt-get install -y postgresql postgresql-contrib
systemctl start postgresql
systemctl enable postgresql
echo "✅ PostgreSQL installed and started"
echo ""

# ═══════════════════════════════════════════════════════════════════════════════
# 4. Install PM2
# ═══════════════════════════════════════════════════════════════════════════════
echo "📦 Installing PM2 (process manager)..."
npm install -g pm2
echo "✅ PM2 $(pm2 --version) installed"
echo ""

# ═══════════════════════════════════════════════════════════════════════════════
# 5. Install Git
# ═══════════════════════════════════════════════════════════════════════════════
echo "📦 Installing Git..."
apt-get install -y git
echo "✅ Git $(git --version | cut -d' ' -f3) installed"
echo ""

# ═══════════════════════════════════════════════════════════════════════════════
# 6. Create scout user
# ═══════════════════════════════════════════════════════════════════════════════
echo "👤 Creating scout user..."
if id "scout" &>/dev/null; then
    echo "⚠️  User 'scout' already exists, skipping..."
else
    useradd -m -s /bin/bash scout
    echo "✅ User 'scout' created"
fi
echo ""

# ═══════════════════════════════════════════════════════════════════════════════
# 7. Setup PostgreSQL database
# ═══════════════════════════════════════════════════════════════════════════════
echo "🗄️  Setting up PostgreSQL database..."

# Generate random password if not set
DB_PASSWORD="${SCOUT_DB_PASSWORD:-$(openssl rand -base64 24)}"

# Create database and user
sudo -u postgres psql << EOF
-- Drop if exists (for fresh install)
DROP DATABASE IF EXISTS scout;
DROP USER IF EXISTS scout;

-- Create user and database
CREATE USER scout WITH PASSWORD '$DB_PASSWORD';
CREATE DATABASE scout OWNER scout;
GRANT ALL PRIVILEGES ON DATABASE scout TO scout;
EOF

echo "✅ Database 'scout' created"
echo "✅ Database user 'scout' created"
echo ""
echo "📝 Database credentials:"
echo "   Username: scout"
echo "   Password: $DB_PASSWORD"
echo "   Database: scout"
echo "   Connection string: postgresql://scout:$DB_PASSWORD@localhost:5432/scout"
echo ""
echo "⚠️  SAVE THESE CREDENTIALS! You'll need them for .env file"
echo ""

# ═══════════════════════════════════════════════════════════════════════════════
# 8. Setup firewall (optional but recommended)
# ═══════════════════════════════════════════════════════════════════════════════
echo "🔥 Setting up firewall..."
apt-get install -y ufw
ufw --force enable
ufw allow 22/tcp   # SSH
ufw allow 80/tcp   # HTTP (for web dashboard)
ufw allow 443/tcp  # HTTPS
ufw allow 4000/tcp # Scout server
echo "✅ Firewall configured (SSH, HTTP, HTTPS, 4000)"
echo ""

# ═══════════════════════════════════════════════════════════════════════════════
# 9. Setup SSH key for GitHub Actions (for auto-deploy)
# ═══════════════════════════════════════════════════════════════════════════════
echo "🔑 Setting up SSH key for GitHub Actions..."
sudo -u scout bash << 'EOSCOUT'
cd ~
mkdir -p .ssh
chmod 700 .ssh

# Generate SSH key if it doesn't exist
if [ ! -f ~/.ssh/id_ed25519 ]; then
    ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/id_ed25519 -N ""
    cat ~/.ssh/id_ed25519.pub >> ~/.ssh/authorized_keys
    chmod 600 ~/.ssh/authorized_keys
    echo "✅ SSH key generated"
else
    echo "⚠️  SSH key already exists"
fi
EOSCOUT
echo ""

# ═══════════════════════════════════════════════════════════════════════════════
# 10. Clone repository (optional - can be done manually)
# ═══════════════════════════════════════════════════════════════════════════════
echo "📥 Ready to clone repository..."
echo ""
echo "Run these commands to clone your repo (as scout user):"
echo ""
echo "  sudo su - scout"
echo "  git clone YOUR_REPO_URL scout"
echo "  cd scout"
echo ""

# ═══════════════════════════════════════════════════════════════════════════════
# DONE!
# ═══════════════════════════════════════════════════════════════════════════════
echo "════════════════════════════════════════════════════════════════════════════════"
echo "  ✅ VPS Setup Complete!"
echo "════════════════════════════════════════════════════════════════════════════════"
echo ""
echo "📋 Next Steps:"
echo ""
echo "1. Switch to scout user:"
echo "   sudo su - scout"
echo ""
echo "2. Clone your repository:"
echo "   git clone https://github.com/YOUR_USERNAME/scout.git scout"
echo "   cd scout"
echo ""
echo "3. Create .env file with your credentials:"
echo "   nano .env"
echo "   # Add: DATABASE_URL=postgresql://scout:$DB_PASSWORD@localhost:5432/scout"
echo "   # Add: GOLOGIN_API_TOKEN=..."
echo "   # Add: SMARTPROXY_USERNAME=..."
echo "   # Add: INSTAGRAM_USERNAME=..."
echo "   # etc."
echo ""
echo "4. Install dependencies:"
echo "   npm install"
echo ""
echo "5. Run database migrations:"
echo "   npx prisma migrate deploy"
echo ""
echo "6. Start the app:"
echo "   pm2 start ecosystem.config.js"
echo "   pm2 save"
echo "   pm2 startup  # Run the command it outputs"
echo ""
echo "7. Setup GitHub Auto-Deploy:"
echo "   cat ~/.ssh/id_ed25519  # Copy private key"
echo "   # Add to GitHub Secrets as VPS_SSH_KEY"
echo ""
echo "════════════════════════════════════════════════════════════════════════════════"
echo ""
echo "🔐 GitHub Secrets to add (in repo Settings → Secrets → Actions):"
echo ""
echo "   VPS_HOST=$(curl -s ifconfig.me)"
echo "   VPS_USER=scout"
echo "   VPS_SSH_KEY=<paste private key from ~/.ssh/id_ed25519>"
echo "   VPS_PATH=/home/scout/scout"
echo ""
echo "════════════════════════════════════════════════════════════════════════════════"
echo ""
echo "🎉 All done! Your VPS is ready for Scout."
echo ""

