'use strict';

const { spawn }    = require('child_process');
const { EventEmitter } = require('events');
const logger       = require('../utils/logger').child('Tunnel');
const health       = require('../utils/health');
const { ensureCloudflared } = require('./downloader');

const config = require('../config/default.json');

const URL_REGEX = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;

class CloudflareManager extends EventEmitter {
  constructor() {
    super();
    this._process     = null;
    this._url         = null;
    this._restarts    = 0;
    this._running     = false;
    this._binPath     = null;
    this._stopping    = false;
  }

  async start() {
    this._stopping = false;
    this._binPath  = await ensureCloudflared();
    health.setState('tunnel', 'starting');
    return this._spawn();
  }

  _spawn() {
    return new Promise((resolve, reject) => {
      const serverPort = config.server.port || 3000;
      const args = [
        'tunnel',
        '--url', `http://localhost:${serverPort}`,
        '--no-autoupdate',
      ];

      logger.info(`Starting cloudflared: ${this._binPath} ${args.join(' ')}`);
      this._process = spawn(this._binPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      this._running = true;

      let resolved = false;

      const handleOutput = (data) => {
        const line = data.toString();
        logger.debug(`[cloudflared] ${line.trim()}`);

        const match = line.match(URL_REGEX);
        if (match && !resolved) {
          this._url = match[0];
          health.setState('tunnel', 'active', { url: this._url });
          logger.success(`Tunnel active: ${this._url}`);
          this.emit('url', this._url);
          resolved = true;
          resolve(this._url);
        }
      };

      this._process.stdout.on('data', handleOutput);
      this._process.stderr.on('data', handleOutput);

      this._process.on('exit', (code) => {
        this._running = false;
        this._url     = null;
        health.setState('tunnel', 'stopped');

        if (this._stopping) {
          logger.info('Tunnel stopped');
          this.emit('stopped');
          return;
        }

        logger.warn(`cloudflared exited (code ${code}), will restart`);

        if (!resolved) {
          reject(new Error(`cloudflared exited before providing a URL (code ${code})`));
          resolved = true;
        }

        this._scheduleRestart();
      });

      this._process.on('error', (err) => {
        logger.error('cloudflared process error', { err: err.message });
        if (!resolved) {
          reject(err);
          resolved = true;
        }
      });

      // Timeout if no URL in 30s
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          reject(new Error('Tunnel URL not captured within 30 seconds'));
        }
      }, 30000);
    });
  }

  _scheduleRestart() {
    if (this._restarts >= (config.tunnel.max_restarts || 5)) {
      logger.error(`Max tunnel restarts (${config.tunnel.max_restarts}) reached`);
      health.setState('tunnel', 'error');
      this.emit('error', new Error('Max tunnel restarts reached'));
      return;
    }

    const delay = config.tunnel.restart_delay_ms || 5000;
    this._restarts++;
    logger.info(`Restarting tunnel in ${delay}ms (attempt ${this._restarts})`);

    setTimeout(async () => {
      try {
        const url = await this._spawn();
        logger.success(`Tunnel restarted: ${url}`);
        this.emit('restarted', url);
      } catch (err) {
        logger.error('Tunnel restart failed', { err: err.message });
        this._scheduleRestart();
      }
    }, delay);
  }

  stop() {
    this._stopping = true;
    if (this._process && this._running) {
      this._process.kill('SIGTERM');
    }
    this._running = false;
  }

  getURL()     { return this._url; }
  isRunning()  { return this._running; }
}

const manager = new CloudflareManager();

module.exports = {
  start:     () => manager.start(),
  stop:      () => manager.stop(),
  getURL:    () => manager.getURL(),
  isRunning: () => manager.isRunning(),
  on:        (event, handler) => manager.on(event, handler),
};
