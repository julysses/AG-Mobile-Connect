'use strict';

const fs     = require('fs');
const path   = require('path');
const logger = require('../utils/logger').child('PushSubs');
const health = require('../utils/health');

const DATA_DIR  = path.join(__dirname, '..', 'data');
const SUBS_PATH = path.join(DATA_DIR, 'push_subscriptions.json');

let _subscriptions = [];

function load() {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  if (!fs.existsSync(SUBS_PATH)) {
    _subscriptions = [];
    logger.debug('No existing push subscriptions');
    return;
  }

  try {
    _subscriptions = JSON.parse(fs.readFileSync(SUBS_PATH, 'utf8'));
    logger.info(`Loaded ${_subscriptions.length} push subscription(s)`);
    health.setState('push', 'enabled', { subscribers: _subscriptions.length });
  } catch (e) {
    logger.warn('Failed to load push subscriptions', { err: e.message });
    _subscriptions = [];
  }
}

function persist() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(SUBS_PATH, JSON.stringify(_subscriptions, null, 2));
  health.setState('push', _subscriptions.length > 0 ? 'enabled' : 'disabled', {
    subscribers: _subscriptions.length,
  });
}

function add(subscription) {
  if (!subscription || !subscription.endpoint) {
    logger.warn('Invalid subscription object');
    return;
  }

  // Dedup by endpoint
  const exists = _subscriptions.some(s => s.endpoint === subscription.endpoint);
  if (!exists) {
    _subscriptions.push({
      ...subscription,
      addedAt: new Date().toISOString(),
    });
    persist();
    logger.info(`Push subscription added (total: ${_subscriptions.length})`);
  }
}

function remove(endpoint) {
  const before = _subscriptions.length;
  _subscriptions = _subscriptions.filter(s => s.endpoint !== endpoint);
  if (_subscriptions.length < before) {
    persist();
    logger.info(`Push subscription removed (total: ${_subscriptions.length})`);
  }
}

function getAll() {
  return [..._subscriptions];
}

module.exports = { load, add, remove, getAll };
