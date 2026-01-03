#!/bin/bash

# Scout Instagram Automation - Mac Crontab Runner
# Runs staggered sessions throughout the day
#
# Usage:
#   ./scripts/cron/schedule.sh <profile-id> <session-type>
#   ./scripts/cron/schedule.sh main-account morning
#   ./scripts/cron/schedule.sh burner-1 afternoon

set -e

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

cd "$PROJECT_DIR" || exit 1

# Load NVM (if using nvm for Node.js)
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Profile and session from args
PROFILE=$1
SESSION=$2

if [ -z "$PROFILE" ] || [ -z "$SESSION" ]; then
    echo "Usage: $0 <profile-id> <session-type>"
    echo "Example: $0 main-account morning"
    exit 1
fi

# Create logs directory if it doesn't exist
mkdir -p logs

# Log file
LOG_FILE="logs/cron-$PROFILE-$(date +%Y-%m-%d).log"

# Run session
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Running $SESSION session for $PROFILE" >> "$LOG_FILE"

# Execute the session runner
npm run cron:smart -- --profile "$PROFILE" --session "$SESSION" >> "$LOG_FILE" 2>&1

# Log completion
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Completed $SESSION session for $PROFILE" >> "$LOG_FILE"
echo "" >> "$LOG_FILE"

exit 0






