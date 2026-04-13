# AG Mobile Connect — Architecture

## System Diagram

```
┌─────────────────────────────────────────┐
│            PHONE (PWA)                  │
│  Safari / Chrome — installed to home    │
│  screen as standalone web app           │
│                                         │
│  Panels: Chat | Agents | Settings |     │
│          Terminal | Files               │
└───────────────┬─────────────────────────┘
                │ WSS / HTTPS
                │ (wss://abc.trycloudflare.com/ws)
                │
┌───────────────▼─────────────────────────┐
│         CLOUDFLARE EDGE (TLS)           │
│  trycloudflare.com — free ephemeral     │
│  tunnel, no account needed              │
└───────────────┬─────────────────────────┘
                │ HTTP localhost
                │
┌───────────────▼─────────────────────────┐
│         BRIDGE SERVER (Node.js)         │
│  express + ws + chrome-remote-interface │
│                                         │
│  server/index.js     — entry point      │
│  server/auth.js      — session auth     │
│  server/routes.js    — HTTP API         │
│  server/websocket.js — WS server        │
│                                         │
│  cdp/connector.js    — CDP lifecycle    │
│  cdp/observer.js     — DOM watcher      │
│  cdp/snapshots.js    — HTML capture     │
│  cdp/actions.js      — click/type       │
│                                         │
│  push/vapid.js       — VAPID keys       │
│  push/notify.js      — push dispatch    │
│  push/subscriptions.js — sub store      │
│                                         │
│  tunnel/cloudflare.js — tunnel mgr      │
│  tunnel/downloader.js — binary dl       │
│                                         │
│  utils/logger.js     — structured log   │
│  utils/health.js     — status tracking  │
│  utils/network.js    — local IP         │
│  utils/qr.js         — QR printing      │
│  utils/certs.js      — SSL certs        │
└───────────────┬─────────────────────────┘
                │ CDP WebSocket
                │ ws://localhost:9000/json
                │
┌───────────────▼─────────────────────────┐
│      ANTIGRAVITY AI (Electron)          │
│  --remote-debugging-port=9000           │
│  Chrome DevTools Protocol exposed       │
│  at localhost:9000                      │
└─────────────────────────────────────────┘
```

## Module Dependency Graph

```
config/default.json ──────────────────────────────────┐
config/selectors.json ─────────────────────────────┐  │
config/models.json ────────────────────────────┐   │  │
                                                │   │  │
utils/logger.js (no deps) ──────────────────────┼───┼──┤
utils/health.js  ← logger, events               │   │  │
utils/network.js ← os, net                      │   │  │
utils/qr.js      ← qrcode-terminal, fs          │   │  │
utils/certs.js   ← selfsigned, fs, logger       │   │  │
                                                │   │  │
server/auth.js   ← crypto, cookie-session       │   │  │
                                                │   │  │
push/vapid.js    ← web-push, logger             │   │  │
push/subs.js     ← fs, logger, health           │   │  │
push/notify.js   ← web-push, vapid, subs        │   │  │
                                                │   │  │
tunnel/downloader.js ← https, fs, os            │   │  │
tunnel/cloudflare.js ← spawn, downloader        │   │  │
                                                │   │  │
cdp/connector.js ← CRI, logger, health          │   │  │
cdp/snapshots.js ← DOMPurify, jsdom, connector ─┘   │  │
cdp/observer.js  ← connector, logger ───────────────┘  │
cdp/actions.js   ← connector, selectors ───────────────┘
                                                │
server/routes.js ← auth, actions, snapshots     │
server/websocket.js ← ws, observer, snapshots   │
server/index.js  ← everything above ────────────┘

public/ ← standalone, talks over network (no Node deps)
```

## WebSocket Protocol Reference

### Server → Phone

| Type | Payload | Trigger |
|---|---|---|
| `snapshot` | `{ panel, html, timestamp, status }` | Panel DOM changed |
| `generation_start` | `{ model, session_id }` | Stop button appeared |
| `generation_complete` | `{ session_id, duration_ms }` | Stop button gone |
| `approval_needed` | `{ context, buttons[], session_id }` | Approval buttons appeared |
| `agent_update` | `{ agents: [{id, name, status, model}] }` | Agent Manager changed |
| `model_changed` | `{ model, mode }` | Model/mode selector changed |
| `tunnel_url` | `{ url, type }` | Tunnel started/restarted |
| `server_status` | `{ cdp, tunnel, push, server, uptime }` | On connect + health change |
| `action_result` | `{ ok, result, error, code, session_id }` | After action dispatch |
| `error` | `{ code, message }` | CDP disconnect, auth failure |
| `pong` | `{ uptime, status }` | Response to ping |

### Phone → Server

| Type | Payload | Handler |
|---|---|---|
| `subscribe_panel` | `{ panel }` | Register for panel snapshots |
| `action` | `{ action: { type, target, value, session_id } }` | Dispatch CDP action |
| `push_subscribe` | `{ subscription }` | Store Web Push subscription |
| `ping` | `{}` | Server responds with pong |

## CDP Observer Strategy

The observer uses `Runtime.addBinding()` to create a function callable from injected page JavaScript:

```
1. server calls: client.Runtime.addBinding({ name: '__agmc_notify' })
2. server injects: MutationObserver script via Runtime.evaluate
3. injected script calls: window.__agmc_notify(JSON.stringify({ event, data }))
4. server receives: Runtime.bindingCalled event
5. server emits: typed EventEmitter event (e.g., 'generation_complete')
6. websocket.js listens and broadcasts to all WS clients
```

A 10-second heartbeat verifies `window.__agmc_observer_active === true` and re-injects if needed. The observer is also re-injected after `Page.frameNavigated` events.

## Push Notification Flow

```
1. Phone requests Notification.permission
2. Phone calls pushManager.subscribe({ applicationServerKey: vapidPublicKey })
3. Phone sends PushSubscription object to server via WS
4. Server stores subscription in data/push_subscriptions.json
5. CDP observer detects trigger event (e.g., generation_complete)
6. push/notify.js calls web-push.sendNotification() for all stored subs
7. Apple/Google push service delivers to device
8. Service worker receives 'push' event, calls showNotification()
9. User taps notification → service worker opens PWA to correct panel
```

## Security Model

| Threat | Mitigation |
|---|---|
| Unauthorized access | Password + signed httpOnly cookie (24hr TTL) + constant-time comparison |
| MITM on LAN | Auto-generated self-signed TLS cert |
| MITM externally | Cloudflare tunnel provides valid TLS |
| XSS from AG content | DOMPurify sanitization (jsdom window) + strict CSP |
| CDP port exposure | Binds to 127.0.0.1 only |
| Session hijacking | httpOnly + Secure + SameSite=Strict cookies |
| Token/key extraction | CDP used only for DOM/Input — no network interception |
