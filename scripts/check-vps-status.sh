#!/usr/bin/env bash
# Quick VPS status check - run this after SSH'ing into the server.
# Usage: ./scripts/check-vps-status.sh   or   bash scripts/check-vps-status.sh

set -e

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  Scout VPS Status Check"
echo "═══════════════════════════════════════════════════════════"
echo ""

# PM2
echo "📦 PM2 processes:"
if command -v pm2 &>/dev/null; then
  pm2 list 2>/dev/null || echo "  (pm2 not found or no processes)"
else
  echo "  pm2 not installed"
fi
echo ""

# Health
echo "🏥 API health:"
if curl -sf http://127.0.0.1:4000/api/health &>/dev/null; then
  curl -s http://127.0.0.1:4000/api/health | head -1
  echo ""
else
  echo "  API not responding (is Scout running?)"
fi
echo ""

# Scheduler
echo "📅 Scheduler status:"
if curl -sf http://127.0.0.1:4000/api/scheduler/status &>/dev/null; then
  curl -s http://127.0.0.1:4000/api/scheduler/status | head -5
else
  echo "  (API not available)"
fi
echo ""

# Optional: detailed health
echo "🔍 Detailed health (summary):"
if curl -sf http://127.0.0.1:4000/api/health/detailed &>/dev/null; then
  curl -s http://127.0.0.1:4000/api/health/detailed | head -20
else
  echo "  (skip - API not available)"
fi
echo ""
echo "═══════════════════════════════════════════════════════════"
echo ""
