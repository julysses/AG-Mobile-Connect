'use strict';

const { EventEmitter } = require('events');
const connector = require('./connector');
const logger    = require('../utils/logger').child('Observer');
const config    = require('../config/default.json');

// The MutationObserver script injected into the AG Electron page.
// It calls window.__agmc_notify(jsonString) on DOM changes.
const OBSERVER_SCRIPT = `
(function() {
  if (window.__agmc_observer_active) return 'already_active';

  function notify(event, data) {
    try { window.__agmc_notify(JSON.stringify({ event, data: data || {} })); } catch(e) {}
  }

  // Chat / generation state
  function isStopButtonVisible() {
    return !!document.querySelector(
      "button[data-action='stop'], .stop-generation-btn, button[class*='stop']"
    );
  }
  function isApprovalVisible() {
    return !!document.querySelector(
      "button[data-action='allow'], button[data-action='deny'], button[data-action='allow_once']"
    );
  }
  function getAgents() {
    const items = document.querySelectorAll(
      ".agent-item, .agent-card, div[class*='agent-item'], div[class*='session-item']"
    );
    return Array.from(items).map((el, i) => ({
      id:     el.id || ('agent-' + i),
      name:   (el.querySelector('.agent-name, [class*=\"agent-name\"]') || {}).textContent || ('Agent ' + (i+1)),
      status: (el.querySelector('.agent-status, [class*=\"agent-status\"]') || {}).textContent || 'unknown',
    }));
  }
  function getModel() {
    const sel = document.querySelector(
      "select#model-selector, .model-dropdown select, select[class*='model']"
    );
    return sel ? sel.value : null;
  }
  function getMode() {
    const sel = document.querySelector(
      "select#mode-selector, .mode-dropdown select, select[class*='mode']"
    );
    return sel ? sel.value : null;
  }
  function getApprovalContext() {
    const btns = document.querySelectorAll(
      "button[data-action='allow'], button[data-action='deny'], button[data-action='allow_once'], button[data-action='review']"
    );
    return {
      buttons: Array.from(btns).map(b => b.textContent.trim()),
      context: (document.querySelector('.approval-context, .diff-context, .tool-context') || {}).textContent || '',
    };
  }

  let _wasGenerating = isStopButtonVisible();
  let _wasApproval   = isApprovalVisible();
  let _lastModel     = getModel();
  let _lastMode      = getMode();

  // Observe the whole document
  const observer = new MutationObserver(function(mutations) {
    let chatChanged   = false;
    let agentChanged  = false;
    let modelChanged  = false;

    for (const m of mutations) {
      const target = m.target;
      const str = (target.className || '') + (target.id || '');

      if (str.includes('chat') || str.includes('conversation') || str.includes('message')) {
        chatChanged = true;
      }
      if (str.includes('agent') || str.includes('session') || str.includes('manager')) {
        agentChanged = true;
      }
      if (str.includes('model') || str.includes('mode')) {
        modelChanged = true;
      }
    }

    // Check stop button state change
    const nowGenerating = isStopButtonVisible();
    if (nowGenerating && !_wasGenerating) {
      notify('generation_start', { model: getModel() });
      chatChanged = true;
    } else if (!nowGenerating && _wasGenerating) {
      notify('generation_complete', {});
      chatChanged = true;
    }
    _wasGenerating = nowGenerating;

    // Check approval buttons
    const nowApproval = isApprovalVisible();
    if (nowApproval && !_wasApproval) {
      notify('approval_needed', getApprovalContext());
    }
    _wasApproval = nowApproval;

    // Check model/mode change
    const nowModel = getModel();
    const nowMode  = getMode();
    if (nowModel !== _lastModel || nowMode !== _lastMode) {
      notify('model_change', { model: nowModel, mode: nowMode });
      _lastModel = nowModel;
      _lastMode  = nowMode;
    }

    if (chatChanged)  notify('chat_update', {});
    if (agentChanged) notify('agent_update', { agents: getAgents() });
  });

  observer.observe(document.body, {
    childList:     true,
    subtree:       true,
    characterData: true,
    attributes:    true,
    attributeFilter: ['class', 'disabled', 'value', 'style'],
  });

  window.__agmc_observer_active = true;
  return 'injected';
})();
`;

class CDPObserver extends EventEmitter {
  constructor() {
    super();
    this._heartbeatTimer = null;
    this._bound          = false;
    this._started        = false;
  }

  async start() {
    if (this._started) return;
    this._started = true;

    // Wait for CDP to connect, then inject
    if (connector.isConnected()) {
      await this._inject();
    }

    connector.on('connected', async () => {
      this._bound = false; // re-bind on reconnect
      await this._inject();
    });

    // Re-inject on page navigation
    const client = connector.getClient();
    if (client) {
      client.Page.frameNavigated(() => {
        setTimeout(() => this._inject(), 500);
      });
    }

    this._startHeartbeat();
  }

  async _inject() {
    if (!connector.isConnected()) return;
    const client = connector.getClient();
    if (!client) return;

    try {
      // Register the binding so injected JS can call Node.js
      if (!this._bound) {
        await client.Runtime.addBinding({ name: '__agmc_notify' });
        client.Runtime.bindingCalled((params) => {
          if (params.name !== '__agmc_notify') return;
          try {
            const { event, data } = JSON.parse(params.payload);
            logger.debug(`Observer event: ${event}`);
            this.emit(event, data || {});
          } catch (e) {
            logger.warn('Failed to parse observer event', { err: e.message });
          }
        });
        this._bound = true;
      }

      // Re-register navigator on page navigate
      client.Page.frameNavigated(() => {
        this._bound = false;
        setTimeout(() => this._inject(), 600);
      });

      const { result } = await client.Runtime.evaluate({
        expression:    OBSERVER_SCRIPT,
        returnByValue: true,
      });

      logger.debug(`Observer injection result: ${result.value}`);
    } catch (err) {
      logger.warn('Observer injection failed', { err: err.message });
    }
  }

  _startHeartbeat() {
    const intervalMs = config.sync.observer_heartbeat_ms || 10000;
    this._heartbeatTimer = setInterval(async () => {
      if (!connector.isConnected()) return;
      const client = connector.getClient();
      if (!client) return;

      try {
        const { result } = await client.Runtime.evaluate({
          expression:    'window.__agmc_observer_active === true',
          returnByValue: true,
        });

        if (!result.value) {
          logger.warn('Observer not active, re-injecting...');
          this._bound = false;
          await this._inject();
        }
      } catch (e) {
        // CDP not available — will reconnect
      }
    }, intervalMs);
  }

  stop() {
    if (this._heartbeatTimer) clearInterval(this._heartbeatTimer);
    this._started = false;
  }
}

const observer = new CDPObserver();

module.exports = {
  start: () => observer.start(),
  stop:  () => observer.stop(),
  on:    (event, handler) => observer.on(event, handler),
};
