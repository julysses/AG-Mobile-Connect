'use strict';

require('dotenv').config();

const https        = require('https');
const express      = require('express');
const helmet       = require('helmet');
const cookieSession = require('cookie-session');
const path         = require('path');
const fs           = require('fs');

const logger      = require('../utils/logger').child('Server');
const health      = require('../utils/health');
const network     = require('../utils/network');
const { getCerts }     = require('../utils/certs');
const { printQRCodes, saveSession } = require('../utils/qr');
const auth        = require('./auth');
const attachRoutes = require('./routes');
const { createWebSocketServer } = require('./websocket');
const connector   = require('../cdp/connector');
const observer    = require('../cdp/observer');
const tunnel      = require('../tunnel/cloudflare');
const vapid       = require('../push/vapid');
const subscriptions = require('../push/subscriptions');

const config = require('../config/default.json');

async function start() {
  health.setState('server', 'starting');

  // ── 1. Auth ─────────────────────────────────────────────────────────────
  const password = auth.getPassword();
  logger.info('Auth ready');

  // ── 2. SSL Certs ─────────────────────────────────────────────────────────
  const certs = getCerts();

  // ── 3. Push ───────────────────────────────────────────────────────────────
  vapid.init();
  subscriptions.load();

  // ── 4. Express app ────────────────────────────────────────────────────────
  const app = express();

  // Trust proxy (Cloudflare tunnel sits in front)
  app.set('trust proxy', 1);

  // Security headers
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc:  ["'self'"],
        scriptSrc:   ["'self'"],
        styleSrc:    ["'self'"],
        imgSrc:      ["'self'", 'data:'],
        connectSrc:  ["'self'", 'wss:', 'https:'],
        fontSrc:     ["'self'"],
        objectSrc:   ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
    crossOriginEmbedderPolicy: false,
  }));

  // Cookie session
  app.use(cookieSession({
    name:     config.auth.cookie_name || 'agmc_session',
    secret:   auth.getSessionSecret(),
    maxAge:   (config.auth.cookie_ttl_hours || 24) * 3600 * 1000,
    httpOnly: true,
    secure:   true,
    sameSite: 'strict',
  }));

  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  // HTTP request logger
  app.use(logger.http.bind(logger));

  // Static files — public/ served BEFORE auth middleware
  app.use(express.static(path.join(__dirname, '..', 'public'), {
    setHeaders(res, filePath) {
      if (filePath.endsWith('sw.js')) {
        // Service workers must have no cache
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Service-Worker-Allowed', '/');
      }
    },
  }));

  // Auth + API routes
  attachRoutes(app);

  // Catch-all: serve index.html for client-side navigation
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  });

  // ── 5. HTTPS server ───────────────────────────────────────────────────────
  const port = config.server.port || 3000;
  const httpsServer = https.createServer({ key: certs.key, cert: certs.cert }, app);

  // ── 6. WebSocket ──────────────────────────────────────────────────────────
  createWebSocketServer(httpsServer);

  // ── 7. Start listening ────────────────────────────────────────────────────
  await new Promise((resolve, reject) => {
    httpsServer.listen(port, config.server.host || '0.0.0.0', resolve);
    httpsServer.once('error', reject);
  });

  health.setState('server', 'running');
  logger.success(`HTTPS server listening on port ${port}`);

  // ── 8. CDP ────────────────────────────────────────────────────────────────
  try {
    await connector.connect();
    await observer.start();
  } catch (err) {
    logger.warn('CDP not connected at startup (will retry)', { err: err.message });
  }

  // ── 9. Cloudflare tunnel ──────────────────────────────────────────────────
  let tunnelUrl = null;
  if (config.tunnel.enabled !== false) {
    try {
      tunnelUrl = await tunnel.start();
    } catch (err) {
      logger.warn('Tunnel failed to start', { err: err.message });
    }

    tunnel.on('restarted', (url) => {
      const { broadcast } = require('./websocket');
      broadcast({ type: 'tunnel_url', url, tunnelType: 'cloudflare' });
      notify.sendTunnelRestarted(url).catch(() => {});
    });
  }

  // ── 10. QR codes ──────────────────────────────────────────────────────────
  const localIP  = network.getLocalIP();
  const localUrl = `https://${localIP}:${port}`;

  saveSession({ localUrl, tunnelUrl, password });
  await printQRCodes(localUrl, tunnelUrl, password);

  // ── Graceful shutdown ─────────────────────────────────────────────────────
  function shutdown(signal) {
    logger.info(`Received ${signal}, shutting down...`);
    tunnel.stop();
    connector.disconnect();
    observer.stop();
    httpsServer.close(() => {
      logger.info('Server closed');
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 5000);
  }

  process.on('SIGINT',  () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start().catch((err) => {
  logger.error('Fatal startup error', { err: err.message, stack: err.stack });
  process.exit(1);
});
