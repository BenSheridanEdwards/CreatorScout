#!/bin/bash

# Setup Mac Crontab for Scout Automation
# Generates and installs crontab entries for all active profiles
#
# Usage:
#   ./scripts/cron/setup_crontab.sh
#   ./scripts/cron/setup_crontab.sh --dry-run  (preview only)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

DRY_RUN=false
if [ "$1" = "--dry-run" ]; then
    DRY_RUN=true
fi

echo "🔧 Scout Crontab Setup"
echo ""

# Check if profiles config exists
if [ ! -f "$PROJECT_DIR/profiles.config.json" ]; then
    echo "❌ Error: profiles.config.json not found"
    echo "   Please create it from profiles.config.example.json"
    exit 1
fi

# Make schedule.sh executable
chmod +x "$SCRIPT_DIR/schedule.sh"

# Generate crontab entries
CRONTAB_FILE="$PROJECT_DIR/tmp/scout-crontab.txt"
mkdir -p "$PROJECT_DIR/tmp"

cat > "$CRONTAB_FILE" << 'EOF'
# ============================================================================
# Scout Instagram Automation - Cron Schedule
# ============================================================================
# Generated automatically - DO NOT EDIT MANUALLY
# Regenerate by running: ./scripts/cron/setup_crontab.sh
#
# Schedule Pattern:
# - 3 sessions per day per profile (morning, afternoon, evening)
# - Staggered start times (5 min apart)
# - 18-minute sessions
# - Daily counter reset at midnight
#
# Format: minute hour * * * command
# ============================================================================

EOF

# Define session times for Week 1 (vary these weekly)
MAIN_MORNING="15 8"
MAIN_AFTERNOON="30 15"
MAIN_EVENING="45 20"

# Burner offsets (+5min increments)
BURNER_1_MORNING="20 8"
BURNER_1_AFTERNOON="35 15"
BURNER_1_EVENING="50 20"

BURNER_2_MORNING="25 8"
BURNER_2_AFTERNOON="40 15"
BURNER_2_EVENING="55 20"

BURNER_3_MORNING="30 8"
BURNER_3_AFTERNOON="45 15"
BURNER_3_EVENING="0 21"

BURNER_4_MORNING="35 8"
BURNER_4_AFTERNOON="50 15"
BURNER_4_EVENING="5 21"

# Main account
cat >> "$CRONTAB_FILE" << EOF
# MAIN ACCOUNT (high-trust DM sender)
$MAIN_MORNING * * * cd $PROJECT_DIR && ./scripts/cron/schedule.sh main-account morning
$MAIN_AFTERNOON * * * cd $PROJECT_DIR && ./scripts/cron/schedule.sh main-account afternoon
$MAIN_EVENING * * * cd $PROJECT_DIR && ./scripts/cron/schedule.sh main-account evening

EOF

# Burner accounts
for i in {1..4}; do
    MORNING_VAR="BURNER_${i}_MORNING"
    AFTERNOON_VAR="BURNER_${i}_AFTERNOON"
    EVENING_VAR="BURNER_${i}_EVENING"
    
    cat >> "$CRONTAB_FILE" << EOF
# BURNER $i (discovery + following + cold DMs)
${!MORNING_VAR} * * * cd $PROJECT_DIR && ./scripts/cron/schedule.sh burner-$i morning
${!AFTERNOON_VAR} * * * cd $PROJECT_DIR && ./scripts/cron/schedule.sh burner-$i afternoon
${!EVENING_VAR} * * * cd $PROJECT_DIR && ./scripts/cron/schedule.sh burner-$i evening

EOF
done

# Daily counter reset
cat >> "$CRONTAB_FILE" << EOF
# DAILY COUNTER RESET (midnight)
0 0 * * * cd $PROJECT_DIR && npm run cron:reset >> logs/cron-reset-\$(date +\%Y-\%m-\%d).log 2>&1

EOF

# Weekly schedule variance reminder
cat >> "$CRONTAB_FILE" << 'EOF'
# ============================================================================
# WEEKLY SCHEDULE VARIANCE
# ============================================================================
# Change these times weekly to avoid patterns:
# - Vary by ±10-15 minutes
# - Keep 5-minute stagger between profiles
# - Keep session order (morning → afternoon → evening)
#
# Example Week 2:
#   Main morning: 8:05 (was 8:15)
#   Main afternoon: 3:45 (was 3:30)
#   Main evening: 9:00 (was 8:45)
# ============================================================================
EOF

echo "✅ Generated crontab file: $CRONTAB_FILE"
echo ""
echo "📋 Preview:"
cat "$CRONTAB_FILE"
echo ""

if [ "$DRY_RUN" = true ]; then
    echo "🔍 DRY RUN - No changes made"
    echo "   To install, run: ./scripts/cron/setup_crontab.sh"
    exit 0
fi

# Backup existing crontab
echo "💾 Backing up existing crontab..."
crontab -l > "$PROJECT_DIR/tmp/crontab-backup-$(date +%Y%m%d-%H%M%S).txt" 2>/dev/null || true

# Install new crontab
echo "📦 Installing crontab..."
crontab "$CRONTAB_FILE"

echo ""
echo "✅ Crontab installed successfully!"
echo ""
echo "📊 Verify installation:"
echo "   crontab -l"
echo ""
echo "📝 View logs:"
echo "   tail -f logs/cron-main-account-$(date +%Y-%m-%d).log"
echo ""
echo "🔄 Weekly maintenance:"
echo "   Regenerate this crontab weekly with varied times"
echo "   Edit times in this script, then run again"
echo ""




