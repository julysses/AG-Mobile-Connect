'use strict';

const crypto = require('crypto');
const fs     = require('fs');
const path   = require('path');
const logger = require('../utils/logger').child('Auth');

const DATA_DIR    = path.join(__dirname, '..', 'data');
const SESSION_PATH = path.join(DATA_DIR, 'session.json');

let _password      = null;
let _sessionSecret = null;

// ── Token-based auto-auth ────────────────────────────────────────────────
// Map<token, { createdAt, used }>
const _tokens = new Map();
const TOKEN_TTL_MS_DEFAULT = 60 * 60 * 1000; // 60 minutes

function getTokenTTL() {
  const config = require('../config/default.json');
  const minutes = config.auth.token_ttl_minutes || 60;
  return minutes * 60 * 1000;
}

function generateAuthToken() {
  // Clean expired tokens first
  cleanExpiredTokens();
  
  const token = crypto.randomBytes(16).toString('hex');
  _tokens.set(token, { createdAt: Date.now(), used: false });
  logger.info('Generated new auth token');
  return token;
}

function validateToken(token) {
  if (!token || !_tokens.has(token)) return false;

  const entry = _tokens.get(token);
  const ttl   = getTokenTTL();

  // Check expiry
  if (Date.now() - entry.createdAt > ttl) {
    _tokens.delete(token);
    logger.warn('Auth token expired');
    return false;
  }

  // Mark used and remove
  _tokens.delete(token);
  logger.info('Auth token validated and consumed');
  return true;
}

function cleanExpiredTokens() {
  const ttl = getTokenTTL();
  const now = Date.now();
  for (const [token, entry] of _tokens) {
    if (now - entry.createdAt > ttl) {
      _tokens.delete(token);
    }
  }
}

function getActiveToken() {
  cleanExpiredTokens();
  // Return the most recent valid token, or generate a new one
  for (const [token, entry] of _tokens) {
    if (!entry.used) return token;
  }
  return generateAuthToken();
}

// Routes that bypass authentication entirely
const PUBLIC_PATHS = new Set(['/', '/login', '/connect', '/manifest.json', '/sw.js']);
const PUBLIC_PREFIXES = ['/icons/', '/css/', '/js/', '/api/auth/'];

function generatePassword() {
  return crypto.randomBytes(8).toString('hex');
}

function getPassword() {
  if (_password) return _password;

  // Check config override
  const config = require('../config/default.json');
  if (config.auth.password) {
    _password = config.auth.password;
    return _password;
  }

  // Check persisted session
  if (fs.existsSync(SESSION_PATH)) {
    try {
      const session = JSON.parse(fs.readFileSync(SESSION_PATH, 'utf8'));
      if (session.password) {
        _password = session.password;
        return _password;
      }
    } catch (_) { /* ignore */ }
  }

  // Generate new password
  _password = generatePassword();
  return _password;
}

function getSessionSecret() {
  if (_sessionSecret) return _sessionSecret;

  // Prefer explicit environment variable (survives restarts without any file I/O)
  if (process.env.SESSION_SECRET) {
    _sessionSecret = process.env.SESSION_SECRET;
    return _sessionSecret;
  }

  // Try to load a previously-persisted secret so existing mobile cookies stay valid
  if (fs.existsSync(SESSION_PATH)) {
    try {
      const saved = JSON.parse(fs.readFileSync(SESSION_PATH, 'utf8'));
      if (saved.sessionSecret) {
        _sessionSecret = saved.sessionSecret;
        logger.debug('Loaded persisted session secret');
        return _sessionSecret;
      }
    } catch (_) { /* ignore – will generate a new one below */ }
  }

  // First run: generate and persist so the next restart reuses the same secret
  _sessionSecret = crypto.randomBytes(32).toString('hex');
  fs.mkdirSync(DATA_DIR, { recursive: true });
  let existing = {};
  if (fs.existsSync(SESSION_PATH)) {
    try { existing = JSON.parse(fs.readFileSync(SESSION_PATH, 'utf8')); } catch (_) {}
  }
  fs.writeFileSync(SESSION_PATH, JSON.stringify({ ...existing, sessionSecret: _sessionSecret }, null, 2));
  logger.debug('Generated and persisted new session secret');
  return _sessionSecret;
}

function isPublicPath(url) {
  const pathname = url.split('?')[0];
  if (PUBLIC_PATHS.has(pathname)) return true;
  return PUBLIC_PREFIXES.some(p => pathname.startsWith(p));
}

function middleware(req, res, next) {
  if (isPublicPath(req.path)) return next();
  if (req.session && req.session.authenticated) return next();

  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  res.redirect('/login');
}

function loginHandler(req, res) {
  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ error: 'Password required' });
  }

  // Constant-time comparison to prevent timing attacks
  const expected = Buffer.from(getPassword());
  const provided = Buffer.from(password);

  let valid = expected.length === provided.length;
  if (valid) {
    valid = crypto.timingSafeEqual(expected, provided);
  }

  if (!valid) {
    logger.warn('Failed login attempt', { ip: req.ip });
    return res.status(401).json({ error: 'Invalid password' });
  }

  req.session.authenticated = true;
  logger.info('Successful login', { ip: req.ip });
  res.json({ ok: true, redirect: '/' });
}

function tokenLoginHandler(req, res) {
  const { token } = req.query;
  if (!token) {
    return res.redirect('/login');
  }

  if (validateToken(token)) {
    req.session.authenticated = true;
    logger.info('Successful token login', { ip: req.ip });
    return res.redirect('/');
  }

  logger.warn('Failed token login attempt', { ip: req.ip });
  return res.redirect('/login?error=token_expired');
}

function logoutHandler(req, res) {
  req.session = null;
  res.json({ ok: true });
}

module.exports = {
  generatePassword,
  getPassword,
  getSessionSecret,
  generateAuthToken,
  validateToken,
  getActiveToken,
  middleware,
  loginHandler,
  tokenLoginHandler,
  logoutHandler,
};
