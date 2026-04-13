'use strict';

const WebSocket  = require('ws');
const cookie     = require('cookie');
const cookieSession = require('cookie-session');
const logger     = require('../utils/logger').child('WebSocket');
const health     = require('../utils/health');
const snapshots  = require('../cdp/snapshots');
const actions    = require('../cdp/actions');
const observer   = require('../cdp/observer');
const notify     = require('../push/notify');
const subs       = require('../push/subscriptions');
const auth       = require('./auth');

const config = require('../config/default.json');

// Registry of connected, authenticated clients
// Map<ws, { subscribedPanel, isAlive, sessionId }>
const clients = new Map();

let wss = null;

function createWebSocketServer(httpsServer) {
  wss = new WebSocket.Server({ server: httpsServer, path: '/ws' });

  wss.on('connection', (ws, req) => {
    // Authenticate via session cookie
    if (!isAuthenticated(req)) {
      ws.send(JSON.stringify({ type: 'error', code: 'UNAUTHORIZED', message: 'Not authenticated' }));
      ws.close();
      return;
    }

    const sessionId = require('crypto').randomBytes(6).toString('hex');
    clients.set(ws, {
      subscribedPanel: config.panels.default || 'chat',
      isAlive:         true,
      sessionId,
    });

    logger.info(`WS client connected (${clients.size} total)`, { sessionId });

    // Send initial server status
    ws.send(JSON.stringify({ type: 'server_status', ...health.getState() }));

    ws.on('pong', () => {
      const client = clients.get(ws);
      if (client) client.isAlive = true;
    });

    ws.on('message', (raw) => handleMessage(ws, raw));

    ws.on('close', () => {
      clients.delete(ws);
      logger.debug(`WS client disconnected (${clients.size} remaining)`);
    });

    ws.on('error', (err) => {
      logger.warn('WS client error', { err: err.message, sessionId });
      clients.delete(ws);
    });
  });

  // Heartbeat: ping all clients every 30s, drop unresponsive
  const pingInterval = setInterval(() => {
    for (const [ws, meta] of clients) {
      if (!meta.isAlive) {
        clients.delete(ws);
        ws.terminate();
        continue;
      }
      meta.isAlive = false;
      ws.ping();
    }
  }, 30000);

  wss.on('close', () => clearInterval(pingInterval));

  // Wire CDP observer events → broadcasts + push notifications
  observer.on('chat_update', async () => {
    const snapshot = await snapshots.capturePanel('chat');
    broadcastPanel('chat', { type: 'snapshot', ...snapshot });
  });

  observer.on('generation_start', (data) => {
    broadcast({ type: 'generation_start', model: data.model, session_id: data.sessionId });
  });

  observer.on('generation_complete', (data) => {
    broadcast({ type: 'generation_complete', session_id: data.sessionId, duration_ms: data.durationMs });
    notify.sendGenerationComplete(data.sessionId, data.durationMs).catch(() => {});
  });

  observer.on('approval_needed', (data) => {
    broadcast({ type: 'approval_needed', context: data.context, buttons: data.buttons, session_id: data.sessionId });
    notify.sendApprovalNeeded(data.context, data.sessionId).catch(() => {});
  });

  observer.on('agent_update', async (data) => {
    const snapshot = await snapshots.capturePanel('agents');
    broadcastPanel('agents', { type: 'snapshot', ...snapshot });
    broadcast({ type: 'agent_update', agents: data.agents || [] });
  });

  observer.on('model_change', (data) => {
    broadcast({ type: 'model_changed', model: data.model, mode: data.mode });
  });

  // Health state changes → broadcast status
  health.on('change', () => {
    broadcast({ type: 'server_status', ...health.getState() });
  });

  logger.info('WebSocket server ready');
  return wss;
}

function isAuthenticated(req) {
  try {
    const cookieHeader = req.headers.cookie || '';
    const cookies      = cookie.parse(cookieHeader);
    const sessionName  = config.auth.cookie_name || 'agmc_session';
    const raw          = cookies[sessionName];
    if (!raw) return false;

    // Decode cookie-session payload (base64 JSON, may be signed)
    // cookie-session uses two cookies: the session data and a .sig cookie
    // The data cookie is base64url-encoded JSON
    let payload = raw;
    if (payload.startsWith('eyJ')) {
      // plain base64 JSON
      const decoded = Buffer.from(payload, 'base64').toString('utf8');
      const session = JSON.parse(decoded);
      return session.authenticated === true;
    }
    return false;
  } catch (e) {
    logger.debug('WS auth check failed', { err: e.message });
    return false;
  }
}

function send(ws, message) {
  if (ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify(message));
    } catch (e) {
      logger.warn('WS send failed', { err: e.message });
    }
  }
}

function broadcast(message) {
  for (const ws of clients.keys()) {
    send(ws, message);
  }
}

function broadcastPanel(panel, message) {
  for (const [ws, meta] of clients) {
    if (meta.subscribedPanel === panel) {
      send(ws, message);
    }
  }
}

async function handleMessage(ws, raw) {
  let msg;
  try {
    msg = JSON.parse(raw.toString());
  } catch {
    return send(ws, { type: 'error', message: 'Invalid JSON' });
  }

  const meta = clients.get(ws);
  if (!meta) return;

  switch (msg.type) {
    case 'subscribe_panel': {
      const allowed = config.panels.available || ['chat', 'agents', 'settings', 'terminal', 'files'];
      if (allowed.includes(msg.panel)) {
        meta.subscribedPanel = msg.panel;
        // Send current snapshot immediately
        try {
          const snapshot = await snapshots.capturePanel(msg.panel);
          send(ws, { type: 'snapshot', ...snapshot });
        } catch (e) { /* CDP may not be ready */ }
      }
      break;
    }

    case 'action': {
      try {
        const result = await actions.dispatch(msg);
        send(ws, { type: 'action_result', ok: true, result, session_id: msg.session_id });
      } catch (err) {
        send(ws, { type: 'action_result', ok: false, error: err.message, code: err.code, session_id: msg.session_id });
      }
      break;
    }

    case 'push_subscribe': {
      if (msg.subscription) {
        subs.add(msg.subscription);
        send(ws, { type: 'push_subscribed', ok: true });
      }
      break;
    }

    case 'ping': {
      send(ws, { type: 'pong', uptime: health.getUptime(), status: health.getState() });
      break;
    }

    default:
      send(ws, { type: 'error', message: `Unknown message type: ${msg.type}` });
  }
}

module.exports = { createWebSocketServer, broadcast, broadcastPanel };
