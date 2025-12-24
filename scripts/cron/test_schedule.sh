#!/bin/bash

# Test Scout Cron Scheduling
# Runs a test session to verify everything works before installing crontab
#
# Usage:
#   ./scripts/cron/test_schedule.sh
#   ./scripts/cron/test_schedule.sh main-account morning

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

cd "$PROJECT_DIR" || exit 1

# Default test profile
PROFILE=${1:-"main-account"}
SESSION=${2:-"morning"}

echo "🧪 Testing Scout Cron Schedule"
echo ""
echo "Profile: $PROFILE"
echo "Session: $SESSION"
echo ""

# Check if profiles config exists
if [ ! -f "$PROJECT_DIR/profiles.config.json" ]; then
    echo "❌ Error: profiles.config.json not found"
    echo "   Please create it from profiles.config.example.json"
    exit 1
fi

# Make schedule.sh executable
chmod +x "$SCRIPT_DIR/schedule.sh"

# Test the schedule script (dry run)
echo "🚀 Running dry-run session..."
echo ""

npm run cron:smart -- --profile "$PROFILE" --session "$SESSION" --dry-run

echo ""
echo "✅ Test completed successfully!"
echo ""
echo "📊 Next steps:"
echo "   1. Review the dry-run output above"
echo "   2. If everything looks good, install crontab:"
echo "      ./scripts/cron/setup_crontab.sh"
echo "   3. Monitor logs:"
echo "      tail -f logs/cron-$PROFILE-$(date +%Y-%m-%d).log"
echo ""

