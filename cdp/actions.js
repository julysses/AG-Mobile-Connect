'use strict';

const connector = require('./connector');
const logger    = require('../utils/logger').child('Actions');

// Per-action-type rate limiting (500ms)
const _lastAction = {};
const RATE_LIMIT_MS = 500;

function checkRateLimit(type) {
  const now  = Date.now();
  const last = _lastAction[type] || 0;
  if (now - last < RATE_LIMIT_MS) {
    throw Object.assign(new Error(`Rate limited: ${type}`), { code: 'RATE_LIMITED' });
  }
  _lastAction[type] = now;
}

function requireConnected() {
  if (!connector.isConnected()) {
    throw Object.assign(new Error('CDP not connected'), { code: 'CDP_NOT_CONNECTED' });
  }
}

async function evaluate(expression) {
  requireConnected();
  const client = connector.getClient();
  const { result, exceptionDetails } = await client.Runtime.evaluate({
    expression,
    returnByValue: true,
    awaitPromise:  false,
  });
  if (exceptionDetails) {
    throw new Error(exceptionDetails.text || 'CDP evaluation error');
  }
  return result.value;
}

// Click a button by text content (supports occurrence index for multiple identical buttons)
function clickButtonScript(text, occurrenceIndex = 0) {
  return `(function() {
    const allBtns = Array.from(document.querySelectorAll('button'));
    const matches = allBtns.filter(b =>
      b.textContent.trim().toLowerCase().includes(${JSON.stringify(text.toLowerCase())}) &&
      !b.disabled
    );
    const btn = matches[${occurrenceIndex}];
    if (!btn) return false;
    btn.click();
    return true;
  })()`;
}

// Click by selector
function clickSelectorScript(selector) {
  return `(function() {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return false;
    el.click();
    return true;
  })()`;
}

async function sendMessage(text, sessionId) {
  checkRateLimit('sendMessage');
  requireConnected();
  logger.info('sendMessage', { sessionId, textLen: text.length });

  const script = `(function() {
    // Try to find input
    const inputSels = [
      'textarea#chat-input',
      '.chat-input textarea',
      'textarea[class*="input"]',
      'textarea',
    ];
    let input = null;
    for (const s of inputSels) {
      input = document.querySelector(s);
      if (input) break;
    }
    if (!input) return { ok: false, reason: 'no_input' };

    // Focus and set value
    input.focus();
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    nativeInputValueSetter.call(input, ${JSON.stringify(text)});
    input.dispatchEvent(new Event('input',  { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));

    // Try send button first
    const sendSels = [
      "button[data-action='send']",
      '.send-btn',
      'button[class*="send"]',
    ];
    for (const s of sendSels) {
      const btn = document.querySelector(s);
      if (btn && !btn.disabled) { btn.click(); return { ok: true, method: 'send_button' }; }
    }

    // Fallback: Enter key
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keyup',   { key: 'Enter', code: 'Enter', bubbles: true }));
    return { ok: true, method: 'enter_key' };
  })()`;

  const result = await evaluate(script);
  if (!result || !result.ok) {
    throw new Error(`sendMessage failed: ${result?.reason || 'unknown'}`);
  }
  return { ok: true, action: 'sendMessage', sessionId };
}

async function stopGeneration(sessionId) {
  checkRateLimit('stopGeneration');
  logger.info('stopGeneration', { sessionId });

  const stopSels = [
    "button[data-action='stop']",
    '.stop-generation-btn',
    'button[class*="stop"]',
  ];

  for (const sel of stopSels) {
    const ok = await evaluate(clickSelectorScript(sel));
    if (ok) return { ok: true, action: 'stopGeneration', sessionId };
  }
  throw new Error('Stop button not found');
}

async function clickApproval(type, sessionId) {
  checkRateLimit('clickApproval_' + type);
  logger.info('clickApproval', { type, sessionId });

  const textMap = {
    allow:       'allow',
    deny:        'deny',
    allow_once:  'allow once',
    review:      'review',
    apply:       'apply',
    save:        'save',
  };

  const text = textMap[type] || type;
  const ok   = await evaluate(clickButtonScript(text, 0));
  if (!ok) throw new Error(`Approval button "${type}" not found`);
  return { ok: true, action: 'clickApproval', type, sessionId };
}

async function switchModel(modelId) {
  checkRateLimit('switchModel');
  logger.info('switchModel', { modelId });

  const script = `(function() {
    const sels = [
      'select#model-selector',
      '.model-dropdown select',
      "select[class*='model']",
    ];
    let sel = null;
    for (const s of sels) { sel = document.querySelector(s); if (sel) break; }
    if (!sel) return false;
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
    nativeSetter.call(sel, ${JSON.stringify(modelId)});
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    sel.dispatchEvent(new Event('input',  { bubbles: true }));
    return true;
  })()`;

  const ok = await evaluate(script);
  if (!ok) throw new Error(`Model selector not found or model "${modelId}" unavailable`);
  return { ok: true, action: 'switchModel', modelId };
}

async function switchMode(mode) {
  checkRateLimit('switchMode');
  logger.info('switchMode', { mode });

  const script = `(function() {
    const sels = [
      'select#mode-selector',
      '.mode-dropdown select',
      "select[class*='mode']",
    ];
    let sel = null;
    for (const s of sels) { sel = document.querySelector(s); if (sel) break; }
    if (!sel) return false;
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
    nativeSetter.call(sel, ${JSON.stringify(mode)});
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`;

  const ok = await evaluate(script);
  if (!ok) throw new Error(`Mode selector not found`);
  return { ok: true, action: 'switchMode', mode };
}

async function newConversation() {
  checkRateLimit('newConversation');
  logger.info('newConversation');

  const newChatSels = [
    "button[data-action='new']",
    'button[class*="new-chat"]',
    'button[class*="new-conversation"]',
  ];

  for (const sel of newChatSels) {
    const ok = await evaluate(clickSelectorScript(sel));
    if (ok) return { ok: true, action: 'newConversation' };
  }

  // Try by text
  const ok = await evaluate(clickButtonScript('new chat', 0));
  if (ok) return { ok: true, action: 'newConversation' };

  throw new Error('New conversation button not found');
}

async function dispatch(action) {
  const { type, target, value, session_id } = action;
  switch (type) {
    case 'sendMessage':    return sendMessage(value, session_id);
    case 'stopGeneration': return stopGeneration(session_id);
    case 'clickApproval':  return clickApproval(target, session_id);
    case 'switchModel':    return switchModel(value);
    case 'switchMode':     return switchMode(value);
    case 'newConversation':return newConversation();
    default:
      throw new Error(`Unknown action type: ${type}`);
  }
}

module.exports = { sendMessage, stopGeneration, clickApproval, switchModel, switchMode, newConversation, dispatch };
