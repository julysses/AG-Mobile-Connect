'use strict';

const webPush = require('web-push');
const fs      = require('fs');
const path    = require('path');
const logger  = require('../utils/logger').child('VAPID');

const DATA_DIR    = path.join(__dirname, '..', 'data');
const VAPID_PATH  = path.join(DATA_DIR, 'vapid_keys.json');

let _publicKey = null;

function init() {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  let keys;
  if (fs.existsSync(VAPID_PATH)) {
    try {
      keys = JSON.parse(fs.readFileSync(VAPID_PATH, 'utf8'));
      logger.debug('Loaded existing VAPID keys');
    } catch (e) {
      logger.warn('Failed to read VAPID keys, regenerating', { err: e.message });
    }
  }

  if (!keys || !keys.publicKey || !keys.privateKey) {
    logger.info('Generating VAPID key pair...');
    keys = webPush.generateVAPIDKeys();
    fs.writeFileSync(VAPID_PATH, JSON.stringify(keys, null, 2));
    logger.success('VAPID keys generated and saved');
  }

  const config = require('../config/default.json');
  webPush.setVapidDetails(config.push.subject, keys.publicKey, keys.privateKey);
  _publicKey = keys.publicKey;

  logger.info('VAPID initialized');
}

function getPublicKey() {
  return _publicKey;
}

module.exports = { init, getPublicKey };
