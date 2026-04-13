'use strict';

const express   = require('express');
const rateLimit = require('express-rate-limit');
const auth      = require('./auth');
const snapshots = require('../cdp/snapshots');
const actions   = require('../cdp/actions');
const notify    = require('../push/notify');
const vapid     = require('../push/vapid');
const subs      = require('../push/subscriptions');
const health    = require('../utils/health');
const logger    = require('../utils/logger').child('Routes');
const tunnel    = require('../tunnel/cloudflare');
const models    = require('../config/models.json');
const config    = require('../config/default.json');

const actionLimiter = rateLimit({
  windowMs:       1000,
  max:            10,
  standardHeaders: true,
  legacyHeaders:   false,
  message:        { error: 'Too many requests' },
});

function attachRoutes(app) {
  // ── Auth routes ──────────────────────────────────────────────────────────
  app.post('/auth/login',  auth.loginHandler);
  app.post('/auth/logout', auth.logoutHandler);

  // Auth status — bypasses middleware (isPublicPath handles /api/auth/)
  app.get('/api/auth/status', (req, res) => {
    res.json({ authenticated: !!(req.session && req.session.authenticated) });
  });

  // ── All routes below require authentication ───────────────────────────────
  app.use(auth.middleware);

  // Server / health status
  app.get('/api/status', (req, res) => {
    res.json(health.getState());
  });

  app.get('/health', (req, res) => {
    const state = health.getState();
    const ok    = health.isHealthy();
    res.status(ok ? 200 : 503).json({ ok, ...state });
  });

  // Panel snapshot (polling fallback)
  app.get('/api/panels/:panel/snapshot', async (req, res) => {
    const { panel } = req.params;
    const allowed   = config.panels.available || ['chat', 'agents', 'settings', 'terminal', 'files'];
    if (!allowed.includes(panel)) {
      return res.status(400).json({ error: 'Unknown panel' });
    }
    try {
      const snapshot = await snapshots.capturePanel(panel);
      res.json(snapshot);
    } catch (err) {
      logger.error('Snapshot failed', { panel, err: err.message });
      res.status(500).json({ error: err.message });
    }
  });

  // Action dispatch
  app.post('/api/actions', actionLimiter, async (req, res) => {
    const action = req.body;
    if (!action || !action.type) {
      return res.status(400).json({ error: 'Missing action type' });
    }
    try {
      const result = await actions.dispatch(action);
      res.json(result);
    } catch (err) {
      const status = err.code === 'CDP_NOT_CONNECTED' ? 503
                   : err.code === 'RATE_LIMITED'      ? 429 : 500;
      logger.warn('Action failed', { type: action.type, err: err.message });
      res.status(status).json({ error: err.message, code: err.code });
    }
  });

  // Tunnel URL
  app.get('/api/tunnel', (req, res) => {
    res.json({ url: tunnel.getURL(), active: tunnel.isRunning() });
  });

  // Models list
  app.get('/api/models', (req, res) => {
    res.json(models);
  });

  // Push: VAPID public key
  app.get('/api/push/vapid-public-key', (req, res) => {
    const key = vapid.getPublicKey();
    if (!key) return res.status(503).json({ error: 'Push not initialized' });
    res.json({ publicKey: key });
  });

  // Push: subscribe
  app.post('/api/push/subscribe', (req, res) => {
    const subscription = req.body;
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: 'Invalid subscription' });
    }
    subs.add(subscription);
    res.json({ ok: true });
  });

  // Push: unsubscribe
  app.delete('/api/push/subscribe', (req, res) => {
    const { endpoint } = req.body || {};
    if (!endpoint) return res.status(400).json({ error: 'endpoint required' });
    subs.remove(endpoint);
    res.json({ ok: true });
  });

  // Config
  app.get('/api/config/panels', (req, res) => {
    res.json(config.panels);
  });
}

module.exports = attachRoutes;
