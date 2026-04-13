# Changelog

## [1.0.0] — 2026-04-13

Initial release.

### Features
- Zero-config one-click launcher (`ag_mobile_connect.command`) for macOS
- Auto-download of `cloudflared` binary for Cloudflare quick tunnel
- Chrome DevTools Protocol bridge to Antigravity AI desktop app
- Real-time WebSocket sync of all panels (Chat, Agents, Settings, Terminal, Files)
- CDP MutationObserver pipeline for live DOM change detection
- Agent Manager panel with one-tap approval for Allow / Deny / Allow Once / Review
- All-model control: Gemini, Claude, GPT switchable from mobile
- Push notifications (VAPID Web Push) for generation complete and approval needed
- Async task queue: type while agent runs, auto-sends on completion
- Progressive Web App: installable, offline-capable, home screen icon
- Service worker with cache-first assets and network-first API strategy
- Password auth with constant-time comparison and signed httpOnly cookies
- Self-signed SSL certificate auto-generation for LAN HTTPS
- Strict Content Security Policy and DOMPurify snapshot sanitization
- QR code terminal output (side-by-side Cloudflare + LAN)
- Auto-reconnect for CDP (exponential backoff) and tunnel (5× restart)

### Compatibility
- Node.js 18+
- macOS (launcher), Linux (manual)
- Antigravity AI with `--remote-debugging-port=9000`
- iOS 16.4+ (PWA push notifications), iOS 15+ (PWA without push)
- Android Chrome 108+ (full PWA + push support)
