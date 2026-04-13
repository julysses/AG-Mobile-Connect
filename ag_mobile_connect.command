#!/usr/bin/env bash
# AG Mobile Connect — One-click launcher for macOS
# Double-click this file in Finder to start.

# Always run from the script's own directory
cd "$(dirname "$0")"

# Make self executable (in case permissions were lost)
chmod +x "${BASH_SOURCE[0]}" 2>/dev/null || true

clear
echo ""
echo "╔══════════════════════════════════════════╗"
echo "║     AG Mobile Connect  v1.0.0            ║"
echo "║     Full remote control for Antigravity  ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ── 1. Check Node.js ──────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  echo "ERROR: Node.js not found."
  echo ""
  echo "Install Node.js from: https://nodejs.org/en/download"
  echo "(Click the big green LTS button and install like any other app)"
  echo ""
  read -r -p "Press Enter to exit..."
  exit 1
fi

NODE_MAJOR=$(node -e "process.stdout.write(process.versions.node.split('.')[0])")
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "ERROR: Node.js 18 or later required."
  echo "Current version: $(node --version)"
  echo "Upgrade at: https://nodejs.org"
  echo ""
  read -r -p "Press Enter to exit..."
  exit 1
fi

echo "✓ Node.js $(node --version)"

# ── 2. npm install if needed ──────────────────────────────────────────────
if [ ! -d "node_modules" ] || [ "package.json" -nt "node_modules" ]; then
  echo "Installing dependencies (first run takes ~30 seconds)..."
  npm install --silent 2>&1
  if [ $? -ne 0 ]; then
    echo "ERROR: npm install failed. Check your internet connection."
    read -r -p "Press Enter to exit..."
    exit 1
  fi
  echo "✓ Dependencies installed"
fi

# ── 3. Create required directories ──────────────────────────────────────────
mkdir -p data certs public/icons

# ── 4. Handle Antigravity launch ──────────────────────────────────────────
AG_APP_NAME="Antigravity"

# Check if AG is running
if pgrep -x "$AG_APP_NAME" &>/dev/null; then
  # Check if debug port is active
  if ! nc -z localhost 9000 2>/dev/null; then
    echo ""
    echo "⚠  Antigravity is running but the remote debug port is not active."
    echo "   Quit Antigravity and relaunch it, or run:"
    echo "   open -a \"$AG_APP_NAME\" --args --remote-debugging-port=9000"
    echo ""
    read -r -p "Continue anyway and connect when AG is restarted? (y/N) " CONT
    if [[ "$CONT" != "y" && "$CONT" != "Y" ]]; then
      exit 0
    fi
  else
    echo "✓ Antigravity is running with debug port"
  fi
else
  echo "Launching Antigravity AI..."
  if [ -d "/Applications/$AG_APP_NAME.app" ]; then
    open -a "$AG_APP_NAME" --args --remote-debugging-port=9000 2>/dev/null || true
    echo "✓ Antigravity launched"
    echo "  Waiting for it to start..."
    sleep 3
  else
    echo "  (Antigravity not found in /Applications — will connect when it starts)"
  fi
fi

# ── 5. Verify CDP ─────────────────────────────────────────────────────────
echo "Checking CDP connection..."
CDP_READY=0
for i in $(seq 1 10); do
  if nc -z localhost 9000 2>/dev/null; then
    CDP_READY=1
    break
  fi
  sleep 2
done

if [ $CDP_READY -eq 1 ]; then
  echo "✓ CDP available at localhost:9000"
else
  echo "  CDP not available — server will retry automatically"
fi

# ── 6. Start bridge server ────────────────────────────────────────────────
echo ""
echo "Starting AG Mobile Connect server..."
echo "(Press Ctrl+C to stop)"
echo ""

# Trap Ctrl+C for clean shutdown
cleanup() {
  echo ""
  echo "Shutting down..."
  kill "$SERVER_PID" 2>/dev/null || true
  exit 0
}
trap cleanup INT TERM

# Start server
node server/index.js &
SERVER_PID=$!

# Wait for server to exit
wait $SERVER_PID
EXIT_CODE=$?

echo ""
if [ $EXIT_CODE -ne 0 ]; then
  echo "Server exited with code $EXIT_CODE"
  read -r -p "Press Enter to close..."
fi
