'use strict';

const crypto = require('crypto');
const fs     = require('fs');
const path   = require('path');
const logger = require('../utils/logger').child('Auth');

const DATA_DIR    = path.join(__dirname, '..', 'data');
const SESSION_PATH = path.join(DATA_DIR, 'session.json');

let _password      = null;
let _sessionSecret = null;

// Routes that bypass authentication entirely
const PUBLIC_PATHS = new Set(['/', '/login', '/manifest.json', '/sw.js']);
const PUBLIC_PREFIXES = ['/icons/', '/css/', '/api/auth/'];

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

function logoutHandler(req, res) {
  req.session = null;
  res.json({ ok: true });
}

module.exports = {
  generatePassword,
  getPassword,
  getSessionSecret,
  middleware,
  loginHandler,
  logoutHandler,
};
