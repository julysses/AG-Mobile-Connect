import { actions } from './actions.js';
import { wsClient } from './ws-client.js';

let _generating = false;
let _queuedMsg  = null;
const QUEUE_SEND_DELAY = 1500;

let elSnapshot, elApproval, elTyping, elInput, elSend, elStop, elQueue, elQueueText, elQueueCancel;

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

  elSend.addEventListener('click', handleSend);
  elStop.addEventListener('click', () => actions.stopGeneration());
  elInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  });
  elInput.addEventListener('input', autoResize);
  elQueueCancel.addEventListener('click', clearQueue);
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
    elSend.hidden   = false;
    elStop.hidden   = true;
    elInput.placeholder = 'Message Antigravity…';
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
