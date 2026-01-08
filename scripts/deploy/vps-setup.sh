#!/bin/bash

# Scout VPS Setup Script
# ======================
#
# This script sets up a fresh Ubuntu 22.04+ VPS for running Scout.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/your-repo/scout/main/scripts/deploy/vps-setup.sh | bash
#
# Or run locally:
#   ./scripts/deploy/vps-setup.sh
#
# Prerequisites:
#   - Ubuntu 22.04 LTS or newer
#   - Root or sudo access
#   - At least 2GB RAM, 20GB disk

set -e

echo "═══════════════════════════════════════════════════════════"
echo "  Scout VPS Setup Script"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "⚠️  Please run as root or with sudo"
    exit 1
fi

# Update system
echo "📦 Updating system packages..."
apt-get update && apt-get upgrade -y

# Install required packages
echo "📦 Installing dependencies..."
apt-get install -y \
    curl \
    wget \
    git \
    build-essential \
    ca-certificates \
    gnupg \
    lsb-release \
    ufw \
    fail2ban

# Install Node.js 20 LTS
echo "📦 Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Verify Node installation
echo "✓ Node.js version: $(node --version)"
echo "✓ npm version: $(npm --version)"

# Install Docker (optional but recommended)
echo "📦 Installing Docker..."
curl -fsSL https://get.docker.com | sh

# Install Docker Compose
echo "📦 Installing Docker Compose..."
DOCKER_COMPOSE_VERSION="v2.24.0"
curl -SL "https://github.com/docker/compose/releases/download/${DOCKER_COMPOSE_VERSION}/docker-compose-linux-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

# Install Chromium and dependencies for headless browser
echo "📦 Installing Chromium dependencies..."
apt-get install -y \
    chromium-browser \
    chromium-chromedriver \
    fonts-liberation \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-kacst \
    fonts-freefont-ttf \
    libxss1 \
    libgbm1 \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    xvfb

# Install PM2 for process management
echo "📦 Installing PM2..."
npm install -g pm2

# Install tsx for TypeScript execution
echo "📦 Installing tsx..."
npm install -g tsx

# Create scout user
echo "👤 Creating scout user..."
if ! id "scout" &>/dev/null; then
    useradd -m -s /bin/bash scout
    usermod -aG docker scout
fi

# Set up UFW firewall
echo "🔒 Configuring firewall..."
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 4000/tcp  # Scout API
ufw --force enable

# Set up fail2ban
echo "🔒 Configuring fail2ban..."
systemctl enable fail2ban
systemctl start fail2ban

# Set timezone (adjust as needed)
echo "🕐 Setting timezone to Europe/London..."
timedatectl set-timezone Europe/London

# Create Scout directories
echo "📁 Creating Scout directories..."
mkdir -p /opt/scout
chown scout:scout /opt/scout

# Create systemd service for Scout
echo "⚙️  Creating systemd service..."
cat > /etc/systemd/system/scout.service << 'EOF'
[Unit]
Description=Scout Instagram Automation
After=network.target

[Service]
Type=simple
User=scout
WorkingDirectory=/opt/scout
ExecStart=/usr/bin/node --loader tsx scripts/deploy/start.ts
Restart=always
RestartSec=10
StandardOutput=append:/opt/scout/logs/scout.log
StandardError=append:/opt/scout/logs/scout.log

# Environment
Environment=NODE_ENV=production
Environment=PORT=4000
EnvironmentFile=/opt/scout/.env

# Security
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/scout

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  ✓ VPS Setup Complete!"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "Next steps:"
echo ""
echo "1. Clone your Scout repository:"
echo "   su - scout"
echo "   cd /opt/scout"
echo "   git clone https://github.com/your-repo/scout.git ."
echo ""
echo "2. Install dependencies:"
echo "   npm install"
echo "   npx prisma generate"
echo ""
echo "3. Create your .env file:"
echo "   cp .env.example .env"
echo "   nano .env  # Fill in your credentials"
echo ""
echo "4. Run database migrations:"
echo "   npx prisma migrate deploy"
echo ""
echo "5. Start Scout:"
echo "   # Using systemd (recommended):"
echo "   sudo systemctl enable scout"
echo "   sudo systemctl start scout"
echo ""
echo "   # Or using PM2:"
echo "   pm2 start ecosystem.config.js"
echo "   pm2 save"
echo "   pm2 startup"
echo ""
echo "6. Check status:"
echo "   sudo systemctl status scout"
echo "   # or: pm2 status"
echo ""
echo "7. View logs:"
echo "   sudo journalctl -u scout -f"
echo "   # or: pm2 logs scout"
echo ""
echo "═══════════════════════════════════════════════════════════"
