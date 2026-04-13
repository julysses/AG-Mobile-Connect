import { wsClient }      from './ws-client.js';
import { chatPanel }     from './chat.js';
import { agentsPanel }   from './agents.js';
import { settingsPanel } from './settings.js';
import { terminalPanel } from './terminal.js';
import { filesPanel }    from './files.js';
import { haptics }       from './haptics.js';
import { pushManager }   from './push.js';
import { initPanelRouter } from './panels.js';

let currentTab = 'chat';

async function checkAuth() {
  try {
    const resp = await fetch('/api/auth/status');
    const data = await resp.json();
    return data.authenticated;
  } catch {
    return false;
  }
}

function showLogin() {
  document.getElementById('login-screen').hidden = false;
  document.getElementById('app-shell').hidden    = true;

  // Check if URL has an error param (expired token)
  const params = new URLSearchParams(location.search);
  if (params.get('error') === 'token_expired') {
    const errEl = document.getElementById('login-error');
    errEl.textContent = 'Connection link expired. Enter password below.';
    errEl.hidden = false;
    // Clean URL
    history.replaceState({}, '', '/');
  }

  const form  = document.getElementById('login-form');
  const errEl = document.getElementById('login-error');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = document.getElementById('login-password').value;
    errEl.hidden   = true;

    const btn = document.getElementById('login-btn');
    btn.disabled    = true;
    btn.textContent = 'Connecting…';

    try {
      const resp = await fetch('/auth/login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ password }),
      });

      if (resp.ok) {
        haptics.medium();
        location.reload();
      } else {
        haptics.error();
        errEl.textContent = 'Wrong password';
        errEl.hidden      = false;
        btn.disabled      = false;
        btn.textContent   = 'Connect';
        document.getElementById('login-password').value = '';
        document.getElementById('login-password').focus();
      }
    } catch {
      btn.disabled    = false;
      btn.textContent = 'Connect';
      errEl.textContent = 'Connection error';
      errEl.hidden      = false;
    }
  });
}

function showApp() {
  document.getElementById('login-screen').hidden = true;
  document.getElementById('app-shell').hidden    = false;

  // Init all panels
  chatPanel.init();
  agentsPanel.init();
  settingsPanel.init();
  terminalPanel.init();
  filesPanel.init();

  // Wire panel router
  initPanelRouter();

  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      if (!tab || tab === currentTab) return;
      switchTab(tab);
    });
  });

  // Connect WebSocket
  wsClient.connect();

  // Subscribe to default panel after connect
  wsClient.on('_connected', () => {
    wsClient.send({ type: 'subscribe_panel', panel: currentTab });
  });

  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').then(() => {
      // Check push subscription status
      pushManager.isSubscribed().then(subbed => {
        if (subbed) {
          const btn = document.getElementById('push-toggle-btn');
          const st  = document.getElementById('push-status');
          if (btn) btn.textContent = 'Enabled ✓';
          if (st)  st.textContent  = 'Active';
        }
      });
    }).catch(err => console.warn('SW registration failed', err));
  }

  // PWA install prompt
  let deferredPrompt;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    // Could show an "Add to Home Screen" banner here
  });
}

function switchTab(tab) {
  haptics.light();

  // Update buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    const active = btn.dataset.tab === tab;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', String(active));
  });

  // Update panels
  document.querySelectorAll('.panel').forEach(panel => {
    panel.classList.toggle('active', panel.dataset.panel === tab);
  });

  currentTab = tab;

  // Tell server about panel switch
  wsClient.send({ type: 'subscribe_panel', panel: tab });
}

// ── Boot ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const authed = await checkAuth();
  if (authed) {
    showApp();
    
    // Initial data fetch to sync UI
    fetch('/api/models')
      .then(r => r.json())
      .then(data => {
        const status = { model: data.models?.[0]?.id, mode: 'fast' };
        chatPanel.onModelChanged(status);
        settingsPanel.onModelChanged(status);
      })
      .catch(() => {});
  } else {
    showLogin();
  }
});
