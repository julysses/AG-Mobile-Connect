'use strict';

const CDP    = require('chrome-remote-interface');
const { EventEmitter } = require('events');
const logger = require('../utils/logger').child('CDP');
const health = require('../utils/health');
const config = require('../config/default.json');

class CDPConnector extends EventEmitter {
  constructor() {
    super();
    this._client       = null;
    this._connected    = false;
    this._retries      = 0;
    this._connecting   = false;
    this._shutdownFlag = false;
  }

  async connect() {
    if (this._connected) return;
    this._shutdownFlag = false;
    health.setState('cdp', 'connecting');
    return this._doConnect();
  }

  async _doConnect() {
    this._connecting = true;
    try {
      logger.info(`Connecting to CDP at ${config.cdp.host}:${config.cdp.port}`);

      // List available targets first
      const targets = await CDP.List({ host: config.cdp.host, port: config.cdp.port });
      const pageTarget = targets.find(
        t => t.type === 'page' && !t.url.startsWith('devtools://')
      );

      const opts = {
        host:   config.cdp.host,
        port:   config.cdp.port,
        target: pageTarget ? pageTarget.id : undefined,
      };

      this._client = await CDP(opts);

      // Enable required domains
      await Promise.all([
        this._client.DOM.enable(),
        this._client.Runtime.enable(),
        this._client.Page.enable(),
        this._client.Network.enable(),
      ]);

      this._connected = true;
      this._retries   = 0;
      this._connecting = false;

      health.setState('cdp', 'connected');
      logger.success('CDP connected');
      this.emit('connected');

      this._client.on('disconnect', () => {
        if (this._shutdownFlag) return;
        this._connected = false;
        health.setState('cdp', 'disconnected');
        logger.warn('CDP disconnected');
        this.emit('disconnected');
        this._scheduleReconnect();
      });

    } catch (err) {
      this._connecting = false;
      logger.warn('CDP connection failed', { err: err.message, retry: this._retries });
      this.emit('reconnecting', this._retries);
      this._scheduleReconnect();
    }
  }

  _scheduleReconnect() {
    if (this._shutdownFlag) return;

    this._retries++;

    // Exponential backoff capped at 30s — but never stop retrying.
    // Antigravity may start after the bridge, or restart at any time.
    const base  = config.cdp.reconnect_interval_ms || 2000;
    const delay = Math.min(base * Math.pow(1.5, this._retries - 1), 30000);

    health.setState('cdp', 'connecting');
    logger.info(`Reconnecting to CDP in ${Math.round(delay / 1000)}s... (attempt ${this._retries})`);

    setTimeout(() => this._doConnect(), delay);
  }

  disconnect() {
    this._shutdownFlag = true;
    if (this._client) {
      this._client.close().catch(() => {});
      this._client = null;
    }
    this._connected = false;
    health.setState('cdp', 'disconnected');
  }

  getClient()   { return this._client; }
  isConnected() { return this._connected && this._client != null; }

  async getTarget() {
    if (!this.isConnected()) return null;
    try {
      const { targetInfos } = await this._client.Target.getTargets();
      return targetInfos.find(
        t => t.type === 'page' && !t.url.startsWith('devtools://')
      ) || null;
    } catch (e) {
      return null;
    }
  }
}

const connector = new CDPConnector();

module.exports = {
  connect:      () => connector.connect(),
  disconnect:   () => connector.disconnect(),
  getClient:    () => connector.getClient(),
  getTarget:    () => connector.getTarget(),
  isConnected:  () => connector.isConnected(),
  on:           (event, handler) => connector.on(event, handler),
};
