# AG Mobile Connect

Full remote control and wireless viewport for Antigravity AI — accessible from any phone, anywhere.

## What it does

AG Mobile Connect is a bridge server that connects to your Antigravity AI desktop app via Chrome DevTools Protocol and serves a Progressive Web App to your phone. You get real-time sync of all panels, one-tap agent approvals, push notifications, and full model control — all over an auto-generated Cloudflare tunnel that works on mobile data.

---

## Quick Start

### Step 1 — Install Node.js (once, ~2 minutes)

1. Go to **nodejs.org** and click the green **LTS** button
2. Install it like any other app — click through all defaults
3. You never need to open Node.js directly

### Step 2 — Download AG Mobile Connect (once)

```bash
git clone https://github.com/julysses/ag-mobile-connect.git
```

Or download the ZIP from GitHub and extract it anywhere.

### Step 3 — Launch (every time)

**macOS:** Double-click `ag_mobile_connect.command`

> If macOS shows "cannot be opened": Right-click → Open → click Open in the dialog. One time only.

**Linux / manual:**
```bash
npm install
node server/index.js
```

### Step 4 — Connect your phone

1. When two QR codes appear, scan either one with your camera
2. Enter the password shown in the terminal
3. When prompted to **Add to Home Screen** — tap Add (installs the app icon)

### Step 5 — Enable notifications (recommended)

Tap Allow when the app requests notification permission. You'll get buzzed when agents finish or need approval — even with your screen locked.

---

## What you can do from your phone

| Feature | Description |
|---|---|
| **Chat** | Send messages, stop generation, respond to approval prompts |
| **Agent Manager** | See all parallel sessions, approve/deny tool calls with one tap |
| **Model switching** | Change AI model (Gemini, Claude, GPT) per session |
| **Terminal** | View live terminal output with ANSI colors |
| **Push notifications** | Get buzzed on completion and approval requests |
| **Async queue** | Type a follow-up while agent runs — it auto-sends on completion |

---

## Configuration

Edit `config/default.json` to change:

- `server.port` — default `3000`
- `auth.password` — set a fixed password (default: auto-generated)
- `tunnel.enabled` — set to `false` to disable Cloudflare tunnel
- `cdp.port` — default `9000` (must match AG's `--remote-debugging-port`)

Edit `config/selectors.json` to update DOM selectors if AG's UI changes.

Edit `config/models.json` to add new AI models — no restart needed.

---

## Troubleshooting

**"macOS cannot verify the developer"**
Right-click `ag_mobile_connect.command` → Open → click Open in the security dialog. One time only.

**Antigravity not detected**
Ensure Antigravity is running. The launcher will attempt to start it automatically. If using a non-standard installation path, launch AG manually with: `open -a Antigravity --args --remote-debugging-port=9000`

**Push notifications not working on iPhone**
iOS requires the PWA installed to Home Screen (iOS 16.4+). In Safari: Share → Add to Home Screen → Add. Then go to Settings tab and tap Enable Notifications.

**Self-signed certificate warning on LAN**
The local QR code uses a self-signed certificate. To bypass the browser warning on your device, visit the HTTPS URL once and tap "Advanced → Proceed". For a trusted cert, use the Cloudflare QR instead.

**Tunnel not connecting**
Wait 15–20 seconds after the server starts. If it still fails, check that no firewall is blocking port 3000. The server will work locally via the LAN QR even without a tunnel.

---

## Architecture

```
Phone (PWA)
    ↕  WSS/HTTPS via Cloudflare or LAN
Bridge Server (Node.js, your Mac)
    ↕  Chrome DevTools Protocol (CDP)
Antigravity AI (Electron app, localhost:9000)
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full technical deep-dive.

---

## Security

- Password authentication with constant-time comparison
- Signed httpOnly session cookies (24hr TTL)
- Auto-generated self-signed SSL cert for LAN
- Cloudflare TLS for external access
- Strict Content Security Policy (no inline scripts)
- All AG DOM snapshots sanitized with DOMPurify before serving
- CDP port binds to 127.0.0.1 only

---

## Requirements

- Node.js 18+
- macOS (launcher) or any Linux (manual start)
- Antigravity AI desktop app
- Internet connection (for Cloudflare tunnel)
