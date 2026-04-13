#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

echo ""
echo "╔══════════════════════════════════════╗"
echo "║    AG Mobile Connect — Uninstall     ║"
echo "╚══════════════════════════════════════╝"
echo ""

read -r -p "Remove AG Mobile Connect data and dependencies? (y/N) " CONFIRM
if [[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]]; then
  echo "Cancelled."
  exit 0
fi

# Kill running processes
echo "Stopping processes..."
pkill -f "node server/index.js" 2>/dev/null || true
pkill -f "cloudflared tunnel"   2>/dev/null || true
echo "✓ Processes stopped"

# Remove generated files
rm -rf data/ certs/ node_modules/
echo "✓ data/, certs/, node_modules/ removed"

# Remove cloudflared binary if local
if [ -f "cloudflared" ]; then
  rm -f cloudflared
  echo "✓ Local cloudflared binary removed"
fi

# Remove from ~/.ag-mobile-connect
if [ -d "$HOME/.ag-mobile-connect" ]; then
  read -r -p "Also remove ~/.ag-mobile-connect/? (y/N) " RMHOME
  if [[ "$RMHOME" == "y" || "$RMHOME" == "Y" ]]; then
    rm -rf "$HOME/.ag-mobile-connect"
    echo "✓ ~/.ag-mobile-connect removed"
  fi
fi

echo ""
echo "Uninstall complete. Git history and source files preserved."
echo ""
