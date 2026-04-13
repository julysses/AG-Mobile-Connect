import { wsClient }      from './ws-client.js';
import { chatPanel }     from './chat.js';
import { agentsPanel }   from './agents.js';
import { settingsPanel } from './settings.js';
import { terminalPanel } from './terminal.js';
import { filesPanel }    from './files.js';

const PANEL_MAP = {
  chat:     chatPanel,
  agents:   agentsPanel,
  settings: settingsPanel,
  terminal: terminalPanel,
  files:    filesPanel,
};

function showToast(message, type = 'info', durationMs = 3000) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast       = document.createElement('div');
  toast.className   = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), durationMs);
}

function updateServerStatus(status) {
  // CDP dot in header
  const cdpDot = document.getElementById('cdp-dot');
  if (cdpDot) {
    cdpDot.className = `status-dot ${status.cdp?.status === 'connected' ? 'connected' : 'disconnected'}`;
    cdpDot.title = `CDP: ${status.cdp?.status || 'unknown'}`;
  }

  // Settings panel
  settingsPanel.onServerStatus?.(status);
}

export function initPanelRouter() {
  // Snapshot routing
  wsClient.on('snapshot', (msg) => {
    const panel = PANEL_MAP[msg.panel];
    if (panel?.onSnapshot) panel.onSnapshot(msg.html);
  });

  // Generation lifecycle
  wsClient.on('generation_start',    (msg) => chatPanel.onGenerationStart(msg));
  wsClient.on('generation_complete', (msg) => chatPanel.onGenerationComplete(msg));
  wsClient.on('approval_needed',     (msg) => chatPanel.onApprovalNeeded(msg));

  // Agent updates
  wsClient.on('agent_update', (msg) => agentsPanel.onAgentUpdate(msg.agents));

  // Model/mode change
  wsClient.on('model_changed', (msg) => {
    settingsPanel.onModelChanged?.(msg);
    chatPanel.onModelChanged?.(msg);
  });

  // Tunnel URL update
  wsClient.on('tunnel_url', (msg) => {
    showToast(`Tunnel: ${msg.url}`, 'info');
    settingsPanel.onServerStatus?.({ tunnel: { url: msg.url, status: 'active' } });
  });

  // Server status
  wsClient.on('server_status', (msg) => updateServerStatus(msg));

  // Errors
  wsClient.on('error', (msg) => {
    showToast(msg.message || 'Server error', 'error');
  });

  // WS connection state
  wsClient.on('_connected', () => {
    document.getElementById('ws-dot')?.classList.replace('disconnected', 'connected');
    document.getElementById('ws-dot')?.classList.add('connected');
    document.getElementById('reconnect-banner')?.classList.remove('visible');
    showToast('Connected', 'success', 1500);
  });

  wsClient.on('_disconnected', () => {
    document.getElementById('ws-dot')?.setAttribute('class', 'status-dot disconnected');
    document.getElementById('reconnect-banner')?.classList.add('visible');
  });

  // Toast from file panel
  document.addEventListener('show-toast', (e) => {
    showToast(e.detail.message, e.detail.type);
  });
}
