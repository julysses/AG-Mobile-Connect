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

async function printQRCodes(localUrl, tunnelUrl, password) {
  const line = '━'.repeat(62);

  console.log('\n' + line);
  console.log('  AG MOBILE CONNECT  ·  Ready');
  console.log(line + '\n');

  let displayBlock;

  if (tunnelUrl) {
    const [leftQR, rightQR] = await Promise.all([
      generateQR(tunnelUrl),
      generateQR(localUrl),
    ]);

    const combined = sideBySide(leftQR, rightQR, 4);
    displayBlock   = combined;

    console.log('  SCAN FROM ANYWHERE             SCAN ON HOME WI-FI ONLY');
    console.log('  (works on mobile data)         (faster, no tunnel)\n');
    console.log(displayBlock);
    console.log(`\n  ${tunnelUrl}`);
    console.log(`  ${' '.repeat(Math.max(0, 33 - tunnelUrl.length))}${localUrl}`);
  } else {
    const qr = await generateQR(localUrl);
    console.log('  SCAN ON HOME WI-FI (tunnel not available)\n');
    console.log(qr);
    console.log(`\n  ${localUrl}`);
  }

  console.log(`\n  Password: ${password}`);
  console.log('  (Auto-generated. Change in config/default.json)\n');
  console.log(line + '\n');
}

function saveSession(data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const sessionPath = path.join(DATA_DIR, 'session.json');
  fs.writeFileSync(sessionPath, JSON.stringify({ ...data, generated: new Date().toISOString() }, null, 2));
}

module.exports = { printQRCodes, saveSession };
