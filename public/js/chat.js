import { actions } from './actions.js';
import { wsClient } from './ws-client.js';

let _generating = false;
let _queuedMsg  = null;
const QUEUE_SEND_DELAY = 1500;

let elSnapshot, elApproval, elTyping, elInput, elSend, elStop, elQueue, elQueueText, elQueueCancel;
let elPlanningBtn, elModelBtn, elModelLabel;

function init() {
  elSnapshot    = document.getElementById('chat-snapshot');
  elApproval    = document.getElementById('chat-approval');
  elTyping      = document.getElementById('chat-typing');
  elInput       = document.getElementById('chat-input');
  elSend        = document.getElementById('chat-send');
  elStop        = document.getElementById('chat-stop');
  elQueue       = document.getElementById('chat-queue');
  elQueueText   = document.getElementById('chat-queue-text');
  elQueueCancel = document.getElementById('chat-queue-cancel');

  elPlanningBtn = document.getElementById('chat-planning-btn');
  elModelBtn    = document.getElementById('chat-model-btn');
  elModelLabel  = document.getElementById('chat-model-label');

  elSend.addEventListener('click', handleSend);
  if (elStop) elStop.addEventListener('click', () => actions.stopGeneration());
  elInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  });
  elInput.addEventListener('input', autoResize);
  elQueueCancel.addEventListener('click', clearQueue);

  elPlanningBtn.addEventListener('click', togglePlanning);
  elModelBtn.addEventListener('click', showModelSelector);
}

function togglePlanning() {
  const isPlanning = elPlanningBtn.classList.contains('active');
  const nextMode   = isPlanning ? 'fast' : 'planning';
  actions.switchMode(nextMode).catch(console.error);
}

function showModelSelector() {
  // Simple approach: trigger the click or focus on the hidden select in settings
  // or better, just cycle through them or show a simple choice
  const select = document.getElementById('model-select');
  if (select) {
    select.focus();
    select.click(); // Some browsers allow this to open dropdown
  }
}

function autoResize() {
  elInput.style.height = 'auto';
  elInput.style.height = Math.min(elInput.scrollHeight, 120) + 'px';
}

function handleSend() {
  const text = elInput.value.trim();
  if (!text) return;

  if (_generating) {
    // Queue for later
    _queuedMsg = text;
    elQueueText.textContent = `⏳ Queued: "${text.slice(0, 40)}${text.length > 40 ? '…' : ''}"`;
    elQueue.hidden = false;
    elInput.value = '';
    autoResize();
    return;
  }

  elInput.value = '';
  autoResize();
  actions.sendMessage(text).catch(console.error);
}

function clearQueue() {
  _queuedMsg = null;
  elQueue.hidden = true;
}

export const chatPanel = {
  init,

  onSnapshot(html) {
    if (!elSnapshot) return;
    if (elSnapshot.innerHTML !== html) {
      elSnapshot.innerHTML = html;
      // Scroll to bottom
      elSnapshot.scrollTop = elSnapshot.scrollHeight;
    }
  },

  onGenerationStart() {
    _generating = true;
    elTyping.hidden = false;
    elSend.hidden   = true;
    elStop.hidden   = false;
    // Update input placeholder
    elInput.placeholder = _queuedMsg ? 'Generation in progress…' : 'Queue for when agent finishes ↓';
  },

  onGenerationComplete() {
    _generating = false;
    elTyping.hidden = true;
    if (elSend) elSend.hidden = false;
    if (elStop) elStop.hidden = true;
    elInput.placeholder = 'Ask anything...';
    elApproval.hidden   = true;

    // Send queued message
    if (_queuedMsg) {
      const msg = _queuedMsg;
      clearQueue();
      setTimeout(() => {
        actions.sendMessage(msg).catch(console.error);
      }, QUEUE_SEND_DELAY);
    }
  },

  onModelChanged(data) {
    if (elModelLabel && data.model) {
      // Find model label from settings list if possible, or just use ID
      const select = document.getElementById('model-select');
      if (select) {
        const opt = [...select.options].find(o => o.value === data.model);
        elModelLabel.textContent = opt ? opt.textContent : data.model;
      } else {
        elModelLabel.textContent = data.model;
      }
    }
    
    if (elPlanningBtn && data.mode) {
      elPlanningBtn.classList.toggle('active', data.mode === 'planning');
    }
  },

  onApprovalNeeded(data) {
    elApproval.hidden   = false;
    elApproval.innerHTML = '';

    const buttons = data.buttons || ['Allow', 'Deny'];
    buttons.forEach(btnText => {
      const key = btnText.toLowerCase().replace(/\s+/g, '_');
      const btn = document.createElement('button');
      btn.className   = key.includes('deny') ? 'btn btn-danger' : 'btn btn-primary';
      btn.textContent = btnText;
      btn.addEventListener('click', () => {
        actions.clickApproval(key, data.session_id).catch(console.error);
        elApproval.hidden = true;
      });
      elApproval.appendChild(btn);
    });
  },
};
