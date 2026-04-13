'use strict';

const https  = require('https');
const http   = require('http');
const fs     = require('fs');
const path   = require('path');
const os     = require('os');
const { execFile } = require('child_process');
const logger = require('../utils/logger').child('Downloader');

const BIN_DIR  = path.join(os.homedir(), '.ag-mobile-connect', 'bin');
const BIN_PATH = path.join(BIN_DIR, 'cloudflared');

// Fallback to local directory
const LOCAL_BIN = path.join(__dirname, '..', 'cloudflared');

const DOWNLOAD_URLS = {
  'darwin-arm64': 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-arm64',
  'darwin-x64':   'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-amd64',
  'linux-x64':    'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64',
  'linux-arm64':  'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64',
};

function getPlatformKey() {
  const platform = os.platform();
  const arch     = process.arch === 'arm64' ? 'arm64' : 'x64';
  if (platform === 'darwin') return `darwin-${arch}`;
  if (platform === 'linux')  return `linux-${arch}`;
  return null;
}

function checkBinary(binPath) {
  return new Promise((resolve) => {
    if (!fs.existsSync(binPath)) return resolve(false);
    execFile(binPath, ['--version'], { timeout: 3000 }, (err) => resolve(!err));
  });
}

function checkSystem() {
  return new Promise((resolve) => {
    execFile('which', ['cloudflared'], { timeout: 3000 }, (err, stdout) => {
      if (err || !stdout.trim()) return resolve(null);
      resolve(stdout.trim());
    });
  });
}

function downloadFile(url, destPath, attempt = 1) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    logger.info(`Downloading cloudflared (attempt ${attempt})...`);

    const protocol = url.startsWith('https') ? https : http;

    function doRequest(requestUrl) {
      protocol.get(requestUrl, (res) => {
        // Follow redirects
        if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307) {
          file.close();
          const redirectUrl = res.headers.location;
          // Use https for redirect if it starts with https
          const redirectProto = redirectUrl.startsWith('https') ? https : http;
          redirectProto.get(redirectUrl, (res2) => {
            const total = parseInt(res2.headers['content-length'] || '0', 10);
            let downloaded = 0;

            res2.on('data', (chunk) => {
              downloaded += chunk.length;
              if (total > 0) {
                const pct = Math.floor((downloaded / total) * 100);
                process.stdout.write(`\r  Downloading cloudflared... ${pct}%`);
              }
            });

            const file2 = fs.createWriteStream(destPath);
            res2.pipe(file2);
            file2.on('finish', () => {
              process.stdout.write('\n');
              file2.close();
              resolve();
            });
            file2.on('error', reject);
            res2.on('error', reject);
          }).on('error', reject);
          return;
        }

        if (res.statusCode !== 200) {
          file.close();
          return reject(new Error(`HTTP ${res.statusCode} downloading cloudflared`));
        }

        const total = parseInt(res.headers['content-length'] || '0', 10);
        let downloaded = 0;

        res.on('data', (chunk) => {
          downloaded += chunk.length;
          if (total > 0) {
            const pct = Math.floor((downloaded / total) * 100);
            process.stdout.write(`\r  Downloading cloudflared... ${pct}%`);
          }
        });

        res.pipe(file);
        file.on('finish', () => {
          process.stdout.write('\n');
          file.close();
          resolve();
        });
        file.on('error', reject);
        res.on('error', reject);
      }).on('error', reject);
    }

    doRequest(url);
  });
}

async function ensureCloudflared() {
  // 1. Check ~/.ag-mobile-connect/bin/cloudflared
  if (await checkBinary(BIN_PATH)) {
    logger.debug(`Using cloudflared at ${BIN_PATH}`);
    return BIN_PATH;
  }

  // 2. Check local directory
  if (await checkBinary(LOCAL_BIN)) {
    logger.debug(`Using local cloudflared at ${LOCAL_BIN}`);
    return LOCAL_BIN;
  }

  // 3. Check system PATH
  const systemBin = await checkSystem();
  if (systemBin) {
    logger.debug(`Using system cloudflared at ${systemBin}`);
    return systemBin;
  }

  // 4. Download
  const platformKey = getPlatformKey();
  if (!platformKey) {
    throw new Error(`Unsupported platform: ${os.platform()} ${process.arch}. Download cloudflared manually from https://github.com/cloudflare/cloudflared/releases`);
  }

  const url = DOWNLOAD_URLS[platformKey];
  fs.mkdirSync(BIN_DIR, { recursive: true });

  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      await downloadFile(url, BIN_PATH, attempt);
      fs.chmodSync(BIN_PATH, 0o755);
      logger.success(`cloudflared downloaded to ${BIN_PATH}`);
      return BIN_PATH;
    } catch (err) {
      if (attempt === MAX_ATTEMPTS) throw err;
      logger.warn(`Download attempt ${attempt} failed, retrying...`, { err: err.message });
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

module.exports = { ensureCloudflared };
