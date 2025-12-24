#!/bin/bash

# Dynamic Crontab Setup - Reads profiles.config.json
# Generates crontab entries only for profiles that exist
#
# Usage:
#   ./scripts/cron/setup_crontab_dynamic.sh
#   ./scripts/cron/setup_crontab_dynamic.sh --dry-run

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

DRY_RUN=false
if [ "$1" = "--dry-run" ]; then
    DRY_RUN=true
fi

echo "🔧 Scout Dynamic Crontab Setup"
echo ""

# Check if profiles config exists
if [ ! -f "$PROJECT_DIR/profiles.config.json" ]; then
    echo "❌ Error: profiles.config.json not found"
    exit 1
fi

# Make schedule.sh executable
chmod +x "$SCRIPT_DIR/schedule.sh"

# Generate crontab entries
CRONTAB_FILE="$PROJECT_DIR/tmp/scout-crontab.txt"
mkdir -p "$PROJECT_DIR/tmp"

cat > "$CRONTAB_FILE" << 'EOF'
# ============================================================================
# Scout Instagram Automation - Dynamic Cron Schedule
# ============================================================================
# Generated automatically from profiles.config.json
# Regenerate by running: ./scripts/cron/setup_crontab_dynamic.sh
#
# Format: minute hour * * * command
# ============================================================================

EOF

# Parse profiles from JSON and generate cron entries
echo "📋 Detected profiles:"
echo ""

# Use Node.js to parse JSON and generate cron entries
node << 'NODEJS' >> "$CRONTAB_FILE"
const fs = require('fs');
const path = require('path');

const configPath = path.join(process.cwd(), 'profiles.config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

const profiles = config.profiles.filter(p => !p.archivedAt);

// Base times for main account (Week 1)
const baseTimes = {
  main: {
    morning: { hour: 8, minute: 15 },
    afternoon: { hour: 15, minute: 30 },
    evening: { hour: 20, minute: 45 }
  }
};

let offsetMinutes = 0;

profiles.forEach((profile, index) => {
  console.error(`   ${index + 1}. ${profile.id} (${profile.type})`);
  
  const isMain = profile.type === 'main';
  const baseTime = baseTimes.main;
  
  // Calculate offset (0 for main, +5 for each burner)
  if (!isMain) {
    offsetMinutes += 5;
  }
  
  const times = {
    morning: calculateTime(baseTime.morning, isMain ? 0 : offsetMinutes),
    afternoon: calculateTime(baseTime.afternoon, isMain ? 0 : offsetMinutes),
    evening: calculateTime(baseTime.evening, isMain ? 0 : offsetMinutes)
  };
  
  console.log(`\n# ${profile.id.toUpperCase()} (${profile.type})`);
  
  Object.entries(times).forEach(([session, time]) => {
    if (profile.sessions && profile.sessions[session] && profile.sessions[session].enabled) {
      console.log(`${time.minute} ${time.hour} * * * cd ${process.env.HOME}/Coding/Experiments/scout && ./scripts/cron/schedule.sh ${profile.id} ${session}`);
    }
  });
  
  console.log('');
});

console.log('# DAILY COUNTER RESET (midnight)');
console.log('0 0 * * * cd ' + process.env.HOME + '/Coding/Experiments/scout && npm run cron:reset >> logs/cron-reset-$(date +\\%Y-\\%m-\\%d).log 2>&1\n');

console.error('');
console.error(`✅ Generated entries for ${profiles.length} profile(s)`);

function calculateTime(baseTime, offsetMinutes) {
  let hour = baseTime.hour;
  let minute = baseTime.minute + offsetMinutes;
  
  // Handle minute overflow
  while (minute >= 60) {
    minute -= 60;
    hour += 1;
  }
  
  return { hour, minute };
}
NODEJS

echo ""
cat "$CRONTAB_FILE"
echo ""

if [ "$DRY_RUN" = true ]; then
    echo "🔍 DRY RUN - No changes made"
    echo "   To install, run: ./scripts/cron/setup_crontab_dynamic.sh"
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


