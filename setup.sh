#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

echo ""
echo "╔══════════════════════════════════════╗"
echo "║    AG Mobile Connect — Setup         ║"
echo "╚══════════════════════════════════════╝"
echo ""

# 1. Check Node.js
if ! command -v node &>/dev/null; then
  echo "ERROR: Node.js not found."
  echo "Install from: https://nodejs.org"
  exit 1
fi

NODE_MAJOR=$(node -e "process.stdout.write(process.versions.node.split('.')[0])")
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "ERROR: Node.js 18+ required (found v$(node --version))"
  echo "Upgrade at: https://nodejs.org"
  exit 1
fi

echo "✓ Node.js $(node --version)"

# 2. npm install
echo "Installing dependencies..."
npm install --silent
echo "✓ Dependencies installed"

# 3. Create directories
mkdir -p data certs public/icons
echo "✓ Directories created"

# 4. Make launcher executable
if [ -f "ag_mobile_connect.command" ]; then
  chmod +x ag_mobile_connect.command
  echo "✓ Launcher made executable"
fi

# 5. Summary
echo ""
echo "Setup complete! To start AG Mobile Connect:"
echo ""
echo "  macOS:  Double-click ag_mobile_connect.command"
echo "  Linux:  node server/index.js"
echo ""
