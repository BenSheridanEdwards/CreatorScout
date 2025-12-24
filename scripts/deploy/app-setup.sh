#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# Scout Application Setup Script
# ═══════════════════════════════════════════════════════════════════════════════
#
# Run this script as the 'scout' user AFTER running vps-initial-setup.sh
# This sets up the Scout application itself.
#
# Usage:
#   sudo su - scout
#   cd ~/scout
#   bash scripts/deploy/app-setup.sh
#
# ═══════════════════════════════════════════════════════════════════════════════

set -e  # Exit on error

echo "════════════════════════════════════════════════════════════════════════════════"
echo "  Scout Application Setup"
echo "════════════════════════════════════════════════════════════════════════════════"
echo ""

# Check if running as scout user
if [ "$USER" != "scout" ]; then
    echo "❌ Please run as 'scout' user"
    echo "   Run: sudo su - scout"
    exit 1
fi

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Please run this script from the scout directory"
    echo "   cd ~/scout"
    exit 1
fi

# ═══════════════════════════════════════════════════════════════════════════════
# 1. Check .env exists
# ═══════════════════════════════════════════════════════════════════════════════
if [ ! -f ".env" ]; then
    echo "⚠️  No .env file found!"
    echo ""
    echo "Creating .env template..."
    cat > .env << 'EOF'
# ===========================================
# SMARTPROXY CONFIGURATION
# ===========================================
SMARTPROXY_USERNAME=sp1234567
SMARTPROXY_PASSWORD=your_smartproxy_password
SMARTPROXY_HOST=gate.smartproxy.com
SMARTPROXY_PORT=7000

# ===========================================
# ADSPOWER CONFIGURATION
# ===========================================
ADSPOWER_API_BASE=http://127.0.0.1:50325
ADSPOWER_API_KEY=  # Optional

# ===========================================
# INSTAGRAM CREDENTIALS
# ===========================================
INSTAGRAM_USERNAME=your_instagram_username
INSTAGRAM_PASSWORD=your_instagram_password

# ===========================================
# AI & VISION API
# ===========================================
OPENROUTER_API_KEY=your_openrouter_api_key

# ===========================================
# DATABASE
# ===========================================
DATABASE_URL=postgresql://scout:PASSWORD@localhost:5432/scout

# ===========================================
# DEVELOPMENT FLAGS
# ===========================================
LOCAL_BROWSER=false
DEBUG_LOGS=false
FAST_MODE=false
EOF
    echo "✅ Created .env template"
    echo ""
    echo "❌ Please edit .env with your real credentials:"
    echo "   nano .env"
    echo ""
    echo "Then run this script again."
    exit 1
fi

echo "✅ .env file found"
echo ""

# ═══════════════════════════════════════════════════════════════════════════════
# 2. Install dependencies
# ═══════════════════════════════════════════════════════════════════════════════
echo "📦 Installing Node.js dependencies..."
npm install
echo "✅ Dependencies installed"
echo ""

# ═══════════════════════════════════════════════════════════════════════════════
# 3. Generate Prisma client
# ═══════════════════════════════════════════════════════════════════════════════
echo "🔧 Generating Prisma client..."
npx prisma generate
echo "✅ Prisma client generated"
echo ""

# ═══════════════════════════════════════════════════════════════════════════════
# 4. Run database migrations
# ═══════════════════════════════════════════════════════════════════════════════
echo "🗄️  Running database migrations..."
npx prisma migrate deploy
echo "✅ Database migrations complete"
echo ""

# ═══════════════════════════════════════════════════════════════════════════════
# 5. Setup profiles configuration
# ═══════════════════════════════════════════════════════════════════════════════
if [ ! -f "profiles.config.json" ]; then
    echo "⚠️  No profiles.config.json found"
    echo "Copying example..."
    cp profiles.config.example.json profiles.config.json
    echo "✅ Created profiles.config.json"
    echo ""
    echo "⚠️  Please edit profiles.config.json with your AdsPower profile IDs:"
    echo "   nano profiles.config.json"
    echo ""
else
    echo "✅ profiles.config.json exists"
    echo ""
fi

# ═══════════════════════════════════════════════════════════════════════════════
# 6. Create necessary directories
# ═══════════════════════════════════════════════════════════════════════════════
echo "📁 Creating directories..."
mkdir -p logs tmp screenshots .sessions
echo "✅ Directories created"
echo ""

# ═══════════════════════════════════════════════════════════════════════════════
# 7. Test database connection
# ═══════════════════════════════════════════════════════════════════════════════
echo "🔍 Testing database connection..."
if npx prisma db push --skip-generate 2>&1 | grep -q "successful\|already"; then
    echo "✅ Database connection successful"
else
    echo "❌ Database connection failed"
    echo "   Check your DATABASE_URL in .env"
    exit 1
fi
echo ""

# ═══════════════════════════════════════════════════════════════════════════════
# 8. Start application with PM2
# ═══════════════════════════════════════════════════════════════════════════════
echo "🚀 Starting Scout with PM2..."

# Stop existing processes if any
pm2 delete all 2>/dev/null || true

# Start application
pm2 start ecosystem.config.js

# Save PM2 process list
pm2 save

echo "✅ Scout started with PM2"
echo ""

# ═══════════════════════════════════════════════════════════════════════════════
# 9. Setup PM2 startup (to restart on reboot)
# ═══════════════════════════════════════════════════════════════════════════════
echo "🔄 Setting up PM2 to start on boot..."
echo ""
echo "⚠️  Run this command to enable PM2 startup:"
echo ""
pm2 startup | grep "sudo"
echo ""
echo "Copy and run the 'sudo env' command above as root user."
echo ""

# ═══════════════════════════════════════════════════════════════════════════════
# 10. Display status
# ═══════════════════════════════════════════════════════════════════════════════
echo "════════════════════════════════════════════════════════════════════════════════"
echo "  ✅ Scout Application Setup Complete!"
echo "════════════════════════════════════════════════════════════════════════════════"
echo ""
echo "📊 Current Status:"
pm2 status
echo ""
echo "📋 Next Steps:"
echo ""
echo "1. View logs:"
echo "   pm2 logs scout-server"
echo ""
echo "2. Check health:"
echo "   curl http://localhost:4000/api/health"
echo ""
echo "3. Run a test script:"
echo "   npm run health"
echo ""
echo "4. Setup cron jobs (optional):"
echo "   crontab -e"
echo "   # Add: 0 9,15,21 * * * cd /home/scout/scout && npm run cron:session >> logs/cron.log 2>&1"
echo ""
echo "5. Setup GitHub auto-deploy:"
echo "   cat ~/.ssh/id_ed25519"
echo "   # Copy private key and add to GitHub Secrets as VPS_SSH_KEY"
echo ""
echo "════════════════════════════════════════════════════════════════════════════════"
echo ""
echo "🎉 Scout is now running!"
echo ""

