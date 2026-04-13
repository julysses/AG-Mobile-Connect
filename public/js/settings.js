import { actions }  from './actions.js';
import { wsClient } from './ws-client.js';

let elModelSelect, elModeSelect, elNewConvBtn, elLogoutBtn;
let elCdpStatus, elTunnelStatus, elUptime;
let elPushToggle, elPushStatus;

function init() {
  elModelSelect  = document.getElementById('model-select');
  elModeSelect   = document.getElementById('mode-select');
  elNewConvBtn   = document.getElementById('new-conversation-btn');
  elLogoutBtn    = document.getElementById('logout-btn');
  elCdpStatus    = document.getElementById('settings-cdp-status');
  elTunnelStatus = document.getElementById('settings-tunnel-status');
  elUptime       = document.getElementById('settings-uptime');
  elPushToggle   = document.getElementById('push-toggle-btn');
  elPushStatus   = document.getElementById('push-status');

  // Load models
  fetch('/api/models')
    .then(r => r.json())
    .then(data => populateModels(data))
    .catch(() => {});

  elModelSelect.addEventListener('change', () => {
    actions.switchModel(elModelSelect.value).catch(console.error);
  });

  elModeSelect.addEventListener('change', () => {
    actions.switchMode(elModeSelect.value).catch(console.error);
  });

  elNewConvBtn.addEventListener('click', () => {
    if (confirm('Start a new conversation?')) {
      actions.newConversation().catch(console.error);
    }
  });

  elLogoutBtn.addEventListener('click', () => {
    fetch('/auth/logout', { method: 'POST' }).then(() => location.reload());
  });

  elPushToggle.addEventListener('click', () => {
    import('./push.js').then(m => m.pushManager.subscribe());
  });

  // Update uptime every second
  setInterval(updateUptime, 1000);
}

function populateModels(data) {
  elModelSelect.innerHTML = '';
  (data.models || []).forEach(m => {
    const opt       = document.createElement('option');
    opt.value       = m.id;
    opt.textContent = m.label;
    elModelSelect.appendChild(opt);
  });
}

let _lastStatus = null;
let _startTime  = Date.now();

function updateUptime() {
  if (!elUptime || !_lastStatus) return;
  const secs    = _lastStatus.uptime + Math.floor((Date.now() - _startTime) / 1000);
  const h       = Math.floor(secs / 3600);
  const m       = Math.floor((secs % 3600) / 60);
  const s       = secs % 60;
  elUptime.textContent = `${h}h ${m}m ${s}s`;
}

function onServerStatus(status) {
  _lastStatus = status;
  _startTime  = Date.now();

  if (elCdpStatus) {
    const dot = elCdpStatus.querySelector('.status-dot');
    if (dot) {
      dot.className = `status-dot ${status.cdp?.status === 'connected' ? 'connected' : 'disconnected'}`;
    }
    elCdpStatus.childNodes[elCdpStatus.childNodes.length - 1].textContent =
      ' ' + (status.cdp?.status || 'unknown');
  }

  if (elTunnelStatus) {
    elTunnelStatus.textContent = status.tunnel?.url
      ? status.tunnel.url.replace('https://', '')
      : (status.tunnel?.status || '—');
  }

  if (elUptime) updateUptime();
}

export const settingsPanel = {
  init,

  onSnapshot(_html) { /* settings are driven by server_status, not raw snapshot */ },

  onModelChanged(data) {
    if (elModelSelect && data.model) elModelSelect.value = data.model;
    if (elModeSelect  && data.mode)  elModeSelect.value  = data.mode;
    const elHeaderModel = document.getElementById('header-model');
    if (elHeaderModel) {
      elHeaderModel.textContent = data.model || '';
    }
  },

  onServerStatus,
};
