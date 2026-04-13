'use strict';

const fs         = require('fs');
const path       = require('path');
const selfsigned = require('selfsigned');
const logger     = require('./logger').child('Certs');

const CERTS_DIR  = path.join(__dirname, '..', 'certs');
const KEY_PATH   = path.join(CERTS_DIR, 'server.key');
const CERT_PATH  = path.join(CERTS_DIR, 'server.crt');

function getCerts() {
  fs.mkdirSync(CERTS_DIR, { recursive: true });

  if (fs.existsSync(KEY_PATH) && fs.existsSync(CERT_PATH)) {
    logger.debug('Loaded existing SSL certs');
    return {
      key:  fs.readFileSync(KEY_PATH,  'utf8'),
      cert: fs.readFileSync(CERT_PATH, 'utf8'),
    };
  }

  logger.info('Generating self-signed SSL certificate...');
  const attrs = [{ name: 'commonName', value: 'ag-mobile-connect.local' }];
  const pems  = selfsigned.generate(attrs, { days: 365, keySize: 2048 });

  fs.writeFileSync(KEY_PATH,  pems.private);
  fs.writeFileSync(CERT_PATH, pems.cert);

  logger.success('SSL certificate generated and saved to certs/');
  return { key: pems.private, cert: pems.cert };
}

module.exports = { getCerts };
