#!/bin/bash

# Remove Scout Crontab Entries
# Safely removes all Scout automation cron jobs
#
# Usage:
#   ./scripts/cron/remove_crontab.sh
#   ./scripts/cron/remove_crontab.sh --keep-others  (keep non-Scout entries)

set -e

KEEP_OTHERS=false
if [ "$1" = "--keep-others" ]; then
    KEEP_OTHERS=true
fi

echo "🗑️  Scout Crontab Removal"
echo ""

# Backup existing crontab
BACKUP_FILE="$HOME/.crontab-backup-$(date +%Y%m%d-%H%M%S).txt"
echo "💾 Backing up current crontab to: $BACKUP_FILE"
crontab -l > "$BACKUP_FILE" 2>/dev/null || true

if [ "$KEEP_OTHERS" = true ]; then
    echo "🔍 Removing only Scout entries..."
    
    # Filter out Scout entries
    crontab -l 2>/dev/null | grep -v "scout" | grep -v "Scout" | crontab - || crontab -r
    
    echo "✅ Removed Scout cron jobs (kept other entries)"
else
    echo "🔍 Removing all cron jobs..."
    crontab -r 2>/dev/null || true
    echo "✅ Removed all cron jobs"
fi

echo ""
echo "📋 Backup saved to: $BACKUP_FILE"
echo ""
echo "🔄 To restore:"
echo "   crontab $BACKUP_FILE"
echo ""




