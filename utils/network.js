'use strict';

const os  = require('os');
const net = require('net');

function getLocalIP() {
  const ifaces = os.networkInterfaces();
  const preferred = ['en0', 'eth0', 'wlan0', 'wlp2s0', 'ens3'];

  // Try preferred interfaces first
  for (const name of preferred) {
    const iface = ifaces[name];
    if (!iface) continue;
    for (const addr of iface) {
      if (addr.family === 'IPv4' && !addr.internal) return addr.address;
    }
  }

  // Fallback: first non-loopback IPv4
  for (const iface of Object.values(ifaces)) {
    for (const addr of iface) {
      if (addr.family === 'IPv4' && !addr.internal) return addr.address;
    }
  }

  return '127.0.0.1';
}

function isPortOpen(host, port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error',   () => { socket.destroy(); resolve(false); });
    socket.setTimeout(1000, () => { socket.destroy(); resolve(false); });
  });
}

function waitForPort(host, port, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const start    = Date.now();
    const interval = 500;

    async function attempt() {
      if (await isPortOpen(host, port)) return resolve();
      if (Date.now() - start >= timeoutMs) {
        return reject(new Error(`Port ${host}:${port} not open after ${timeoutMs}ms`));
      }
      setTimeout(attempt, interval);
    }

    attempt();
  });
}

module.exports = { getLocalIP, isPortOpen, waitForPort };
