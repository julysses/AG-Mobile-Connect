'use strict';

const qrcode = require('qrcode-terminal');
const fs     = require('fs');
const path   = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

function generateQR(url) {
  return new Promise((resolve) => {
    qrcode.generate(url, { small: true }, resolve);
  });
}

function sideBySide(leftStr, rightStr, gap = 4) {
  const leftLines  = leftStr.split('\n');
  const rightLines = rightStr.split('\n');
  const maxLen     = Math.max(...leftLines.map(l => l.length));
  const height     = Math.max(leftLines.length, rightLines.length);
  const pad        = ' '.repeat(gap);
  const lines      = [];

  for (let i = 0; i < height; i++) {
    const l = leftLines[i]  || '';
    const r = rightLines[i] || '';
    lines.push(l.padEnd(maxLen) + pad + r);
  }

  return lines.join('\n');
}

async function printQRCodes(localUrl, tunnelUrl, password, token) {
  const line = '━'.repeat(62);

  console.log('\n' + line);
  console.log('  AG MOBILE CONNECT  ·  Ready');
  console.log(line + '\n');

  // Build URLs with embedded auth token for instant connection
  const localConnectUrl  = token ? `${localUrl}/connect?token=${token}` : localUrl;
  const tunnelConnectUrl = tunnelUrl && token ? `${tunnelUrl}/connect?token=${token}` : tunnelUrl;

  let displayBlock;

  if (tunnelConnectUrl) {
    const [leftQR, rightQR] = await Promise.all([
      generateQR(tunnelConnectUrl),
      generateQR(localConnectUrl),
    ]);

    const combined = sideBySide(leftQR, rightQR, 4);
    displayBlock   = combined;

    console.log('  📱 SCAN TO CONNECT INSTANTLY      📱 HOME WI-FI (FASTER)');
    console.log('  (works anywhere, mobile data)      (no tunnel, direct)\n');
    console.log(displayBlock);
    console.log(`\n  🌐 ${tunnelConnectUrl}`);
    console.log(`  🏠 ${localConnectUrl}`);
  } else {
    const qr = await generateQR(localConnectUrl);
    console.log('  📱 SCAN TO CONNECT INSTANTLY\n');
    console.log(qr);
    console.log(`\n  🏠 ${localConnectUrl}`);
  }

  console.log(`\n  🔑 Password (manual fallback): ${password}`);
  console.log('  ✨ QR scan = auto-login, no password needed!\n');
  console.log(line + '\n');
}

function saveSession(data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const sessionPath = path.join(DATA_DIR, 'session.json');
  fs.writeFileSync(sessionPath, JSON.stringify({ ...data, generated: new Date().toISOString() }, null, 2));
}

module.exports = { printQRCodes, saveSession };
