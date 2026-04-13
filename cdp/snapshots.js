'use strict';

const { JSDOM }        = require('jsdom');
const createDOMPurify  = require('dompurify');
const connector        = require('./connector');
const logger           = require('../utils/logger').child('Snapshots');
const config           = require('../config/default.json');

// Initialize DOMPurify once with a jsdom window
const { window: domWindow } = new JSDOM('');
const DOMPurify = createDOMPurify(domWindow);

const ALLOWED_TAGS = [
  'div', 'span', 'p', 'pre', 'code', 'br', 'hr',
  'ul', 'ol', 'li', 'strong', 'em', 'b', 'i',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'button', 'input', 'textarea', 'select', 'option',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'a', 'img', 'svg', 'path',
  'section', 'article', 'header', 'footer', 'nav', 'main',
];

function sanitize(html) {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: ['class', 'id', 'style', 'data-*', 'aria-*', 'role',
                   'src', 'alt', 'href', 'title', 'type', 'value',
                   'disabled', 'checked', 'selected', 'placeholder'],
    FORBID_SCRIPTS: true,
    FORBID_TAGS: ['script', 'style', 'iframe', 'frame', 'object', 'embed'],
  });
}

// Per-panel debounce state
const debounceTimers = {};
const debounceMs     = config.cdp.snapshot_debounce_ms || 150;

// Load selectors at runtime (supports hot-reload)
function getSelectors() {
  // Clear require cache to support hot-reload
  const selectorPath = require.resolve('../config/selectors.json');
  delete require.cache[selectorPath];
  return require('../config/selectors.json');
}

async function capturePanel(panelId) {
  if (!connector.isConnected()) {
    return { panel: panelId, html: '', timestamp: Date.now(), status: 'cdp_not_connected' };
  }

  const client    = connector.getClient();
  const selectors = getSelectors();
  const panelCfg  = selectors[panelId];

  if (!panelCfg) {
    logger.warn(`No selectors configured for panel: ${panelId}`);
    return { panel: panelId, html: '', timestamp: Date.now(), status: 'no_selector' };
  }

  // Find container selector
  const containerSelector = panelCfg.panel_container || panelCfg.container || panelCfg.message_container;
  if (!containerSelector) {
    logger.warn(`No container selector for panel: ${panelId}`);
    return { panel: panelId, html: '', timestamp: Date.now(), status: 'no_selector' };
  }

  try {
    const { result } = await client.Runtime.evaluate({
      expression: `(function() {
        const sel = ${JSON.stringify(containerSelector)};
        const selectors = sel.split(',').map(s => s.trim());
        for (const s of selectors) {
          const el = document.querySelector(s);
          if (el) return el.innerHTML;
        }
        return null;
      })()`,
      returnByValue: true,
    });

    if (result.value == null) {
      return { panel: panelId, html: '', timestamp: Date.now(), status: 'panel_not_visible' };
    }

    const sanitized = sanitize(result.value);
    return { panel: panelId, html: sanitized, timestamp: Date.now(), status: 'ok' };

  } catch (err) {
    logger.error(`Snapshot capture failed for panel: ${panelId}`, { err: err.message });
    return { panel: panelId, html: '', timestamp: Date.now(), status: 'error', error: err.message };
  }
}

function captureWithDebounce(panelId, callback) {
  if (debounceTimers[panelId]) {
    clearTimeout(debounceTimers[panelId]);
  }
  debounceTimers[panelId] = setTimeout(async () => {
    const snapshot = await capturePanel(panelId);
    callback(snapshot);
  }, debounceMs);
}

async function captureAll() {
  const panels  = ['chat', 'agents', 'settings', 'terminal'];
  const results = await Promise.allSettled(panels.map(p => capturePanel(p)));

  const snapshots = {};
  results.forEach((r, i) => {
    snapshots[panels[i]] = r.status === 'fulfilled' ? r.value : { panel: panels[i], html: '', status: 'error' };
  });
  return snapshots;
}

module.exports = { capturePanel, captureAll, captureWithDebounce };
