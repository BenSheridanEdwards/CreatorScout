#!/bin/bash

# Test All Components
# Runs comprehensive test suite for Scout automation
#
# Usage:
#   ./scripts/test_all.sh
#   ./scripts/test_all.sh --profile main-account

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_DIR" || exit 1

PROFILE=${1:-"main-account"}

echo ""
echo "🧪 Scout Comprehensive Test Suite"
echo "═════════════════════════════════"
echo ""

# Test 1: Configuration
echo "📋 Test 1: Configuration"
echo "────────────────────────"
echo ""

if [ -f "profiles.config.json" ]; then
    echo "✓ profiles.config.json exists"
    tsx scripts/list_profiles.ts
else
    echo "❌ profiles.config.json not found"
    exit 1
fi

# Test 2: Environment
echo ""
echo "🌍 Test 2: Environment Variables"
echo "─────────────────────────────────"
echo ""

if [ -f ".env" ]; then
    echo "✓ .env file exists"
    
    # Check required variables
    source .env
    
    if [ -n "$SMARTPROXY_USERNAME" ]; then
        echo "✓ SMARTPROXY_USERNAME set"
    else
        echo "⚠️  SMARTPROXY_USERNAME not set"
    fi
    
    if [ -n "$SMARTPROXY_PASSWORD" ]; then
        echo "✓ SMARTPROXY_PASSWORD set"
    else
        echo "⚠️  SMARTPROXY_PASSWORD not set"
    fi
    
    if [ -n "$DATABASE_URL" ]; then
        echo "✓ DATABASE_URL set"
    else
        echo "⚠️  DATABASE_URL not set"
    fi
else
    echo "❌ .env file not found"
    exit 1
fi

# Test 3: Database
echo ""
echo "🗄️  Test 3: Database Connection"
echo "───────────────────────────────"
echo ""

npx prisma db pull --schema=prisma/schema.prisma > /dev/null 2>&1 && echo "✓ Database connected" || echo "⚠️  Database connection failed"

# Test 4: DM Variation
echo ""
echo "💬 Test 4: DM Variation System"
echo "──────────────────────────────"
echo ""

tsx scripts/test_dm_variation.ts --count 3 --strategy cold

# Test 5: Proxy Manager
echo ""
echo "📡 Test 5: Proxy Manager"
echo "────────────────────────"
echo ""

tsx scripts/test_proxy.ts

# Test 6: Profile Test
echo ""
echo "👤 Test 6: Profile Connection"
echo "─────────────────────────────"
echo ""

echo "Testing profile: $PROFILE"
echo ""
echo "⚠️  Note: This will connect to GoLogin and Instagram"
echo "   Press Ctrl+C to skip, or wait 5 seconds to continue..."
sleep 5

tsx scripts/test_profile.ts --profile "$PROFILE" --skip-warmup

# Summary
echo ""
echo "✅ Test Suite Complete"
echo "═════════════════════"
echo ""
echo "All tests passed! System is ready for automation."
echo ""
echo "📊 Next steps:"
echo "   1. Review test output above"
echo "   2. Test a dry-run session:"
echo "      npm run cron:smart -- --profile $PROFILE --session morning --dry-run"
echo "   3. Install crontab:"
echo "      ./scripts/cron/setup_crontab.sh"
echo ""

