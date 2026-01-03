#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# Scout VPS Setup Script
# ═══════════════════════════════════════════════════════════════════════════════
#
# This script sets up a fresh Ubuntu VPS for running Scout with GoLogin.
# Tested on DigitalOcean droplets (8GB RAM / 4 vCPU recommended)
#
# Usage: curl -fsSL https://raw.githubusercontent.com/your-repo/scout/main/scripts/deploy/vps-setup.sh | sudo bash
# Or: sudo bash scripts/deploy/vps-setup.sh
#
# ═══════════════════════════════════════════════════════════════════════════════

set -e

echo "═══════════════════════════════════════════════════════════════════════════════"
echo "🚀 Scout VPS Setup Script"
echo "═══════════════════════════════════════════════════════════════════════════════"

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo "Please run as root (sudo)"
  exit 1
fi

# Configuration
NODE_VERSION="20"
SCOUT_USER="scout"
SCOUT_DIR="/opt/scout"
ORBITA_PORT="9222"

echo ""
echo "📦 Step 1: Update system packages..."
echo "───────────────────────────────────────────────────────────────────────────────"
apt-get update && apt-get upgrade -y

echo ""
echo "📦 Step 2: Install essential packages..."
echo "───────────────────────────────────────────────────────────────────────────────"
apt-get install -y \
  curl \
  wget \
  git \
  build-essential \
  ca-certificates \
  gnupg \
  lsb-release \
  unzip \
  htop \
  ufw \
  fail2ban

echo ""
echo "📦 Step 3: Install Node.js ${NODE_VERSION}..."
echo "───────────────────────────────────────────────────────────────────────────────"
curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
apt-get install -y nodejs

# Verify Node.js installation
node --version
npm --version

echo ""
echo "📦 Step 4: Install PM2 globally..."
echo "───────────────────────────────────────────────────────────────────────────────"
npm install -g pm2
pm2 startup systemd -u ${SCOUT_USER} --hp /home/${SCOUT_USER}

echo ""
echo "📦 Step 5: Install tsx globally..."
echo "───────────────────────────────────────────────────────────────────────────────"
npm install -g tsx

echo ""
echo "👤 Step 6: Create scout user..."
echo "───────────────────────────────────────────────────────────────────────────────"
if ! id "${SCOUT_USER}" &>/dev/null; then
  useradd -m -s /bin/bash ${SCOUT_USER}
  echo "Created user: ${SCOUT_USER}"
else
  echo "User ${SCOUT_USER} already exists"
fi

echo ""
echo "📁 Step 7: Create application directory..."
echo "───────────────────────────────────────────────────────────────────────────────"
mkdir -p ${SCOUT_DIR}
mkdir -p ${SCOUT_DIR}/logs
chown -R ${SCOUT_USER}:${SCOUT_USER} ${SCOUT_DIR}

echo ""
echo "🔥 Step 8: Configure firewall..."
echo "───────────────────────────────────────────────────────────────────────────────"
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow ${ORBITA_PORT}/tcp  # Orbita debugging port (only from localhost ideally)
ufw --force enable
ufw status

echo ""
echo "🔐 Step 9: Configure fail2ban..."
echo "───────────────────────────────────────────────────────────────────────────────"
systemctl enable fail2ban
systemctl start fail2ban

echo ""
echo "📦 Step 10: Install GoLogin Orbita dependencies..."
echo "───────────────────────────────────────────────────────────────────────────────"
# Install dependencies needed for headless Chrome/Orbita
apt-get install -y \
  libnss3 \
  libatk1.0-0 \
  libatk-bridge2.0-0 \
  libcups2 \
  libdrm2 \
  libxkbcommon0 \
  libxcomposite1 \
  libxdamage1 \
  libxfixes3 \
  libxrandr2 \
  libgbm1 \
  libasound2 \
  libpango-1.0-0 \
  libpangocairo-1.0-0 \
  libcairo2 \
  libatspi2.0-0 \
  libgtk-3-0 \
  fonts-liberation \
  xdg-utils \
  xvfb

echo ""
echo "📦 Step 11: Create GoLogin Orbita start script..."
echo "───────────────────────────────────────────────────────────────────────────────"
cat > /usr/local/bin/start-orbita.sh << 'EOF'
#!/bin/bash
# Start GoLogin Orbita browser
# This script should be run as the scout user

ORBITA_PATH="${HOME}/.gologin/browser/orbita"
PORT=${1:-9222}

if [ ! -f "${ORBITA_PATH}/orbita" ]; then
  echo "Orbita not found. Please install GoLogin first."
  echo "Download from: https://gologin.com/download"
  exit 1
fi

# Start Orbita in headless mode with remote debugging
xvfb-run -a ${ORBITA_PATH}/orbita \
  --no-sandbox \
  --disable-setuid-sandbox \
  --disable-dev-shm-usage \
  --disable-gpu \
  --headless \
  --remote-debugging-port=${PORT} \
  --remote-debugging-address=0.0.0.0
EOF
chmod +x /usr/local/bin/start-orbita.sh

echo ""
echo "📦 Step 12: Create systemd service for Scout..."
echo "───────────────────────────────────────────────────────────────────────────────"
cat > /etc/systemd/system/scout.service << EOF
[Unit]
Description=Scout Instagram Automation
After=network.target

[Service]
Type=simple
User=${SCOUT_USER}
WorkingDirectory=${SCOUT_DIR}
ExecStart=/usr/bin/pm2 start ecosystem.config.js
ExecReload=/usr/bin/pm2 reload all
ExecStop=/usr/bin/pm2 stop all
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload

echo ""
echo "═══════════════════════════════════════════════════════════════════════════════"
echo "✅ VPS Setup Complete!"
echo "═══════════════════════════════════════════════════════════════════════════════"
echo ""
echo "Next steps:"
echo ""
echo "1. Clone your Scout repository:"
echo "   sudo -u ${SCOUT_USER} git clone <your-repo> ${SCOUT_DIR}"
echo ""
echo "2. Install dependencies:"
echo "   cd ${SCOUT_DIR} && npm install"
echo ""
echo "3. Configure environment:"
echo "   cp .env.example .env && nano .env"
echo ""
echo "4. Download and install GoLogin Orbita:"
echo "   - Download from: https://gologin.com/download"
echo "   - Extract to: /home/${SCOUT_USER}/.gologin/browser/orbita"
echo ""
echo "5. Start Scout:"
echo "   pm2 start ecosystem.config.js"
echo "   pm2 save"
echo ""
echo "6. Set up cron jobs:"
echo "   crontab -e"
echo "   # Paste contents from scripts/cron/crontab.example"
echo ""
echo "═══════════════════════════════════════════════════════════════════════════════"








