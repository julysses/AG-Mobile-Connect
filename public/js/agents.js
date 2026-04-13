import { actions } from './actions.js';
import { haptics }  from './haptics.js';

let elList, elBadge;
let _pendingCount = 0;

function init() {
  elList  = document.getElementById('agents-list');
  elBadge = document.getElementById('agents-badge');
}

function statusClass(status = '') {
  const s = status.toLowerCase();
  if (s.includes('run') || s.includes('active'))   return 'badge-success';
  if (s.includes('wait') || s.includes('approv'))   return 'badge-warning';
  if (s.includes('error') || s.includes('fail'))    return 'badge-error';
  if (s.includes('done') || s.includes('complete')) return 'badge-muted';
  return 'badge-info';
}

function renderAgents(agents) {
  if (!elList) return;

  if (!agents || agents.length === 0) {
    elList.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🤖</div>
        <div class="empty-state-text">No active agents</div>
      </div>`;
    updateBadge(0);
    return;
  }

  // Sort: waiting-approval first
  const sorted = [...agents].sort((a, b) => {
    const aWait = (a.status || '').toLowerCase().includes('wait') ? -1 : 1;
    const bWait = (b.status || '').toLowerCase().includes('wait') ? -1 : 1;
    return aWait - bWait;
  });

  _pendingCount = sorted.filter(a => (a.status || '').toLowerCase().includes('wait')).length;
  updateBadge(_pendingCount);

  elList.innerHTML = '';
  sorted.forEach(agent => {
    const card   = document.createElement('div');
    const waiting = (agent.status || '').toLowerCase().includes('wait');
    card.className = `agent-card${waiting ? ' waiting-approval' : ''}`;

    const header = document.createElement('div');
    header.className = 'agent-card-header';

    const name = document.createElement('span');
    name.className   = 'agent-name';
    name.textContent = agent.name || ('Agent ' + (agent.id || '?'));

    const badge = document.createElement('span');
    badge.className   = `badge ${statusClass(agent.status)}`;
    badge.textContent = agent.status || 'unknown';

    header.appendChild(name);
    header.appendChild(badge);
    card.appendChild(header);

    const meta = document.createElement('div');
    meta.className = 'agent-meta';
    if (agent.model) {
      const m = document.createElement('span');
      m.textContent = '🤖 ' + agent.model;
      meta.appendChild(m);
    }
    card.appendChild(meta);

    // Approval buttons for waiting agents
    if (waiting) {
      const bar = document.createElement('div');
      bar.className = 'approval-bar';

      ['Allow', 'Deny', 'Allow Once', 'Review'].forEach(label => {
        const btn = document.createElement('button');
        btn.className   = label === 'Deny' ? 'btn btn-danger btn-sm' : 'btn btn-primary btn-sm';
        btn.textContent = label;
        btn.addEventListener('click', () => {
          haptics.heavy();
          actions.clickApproval(label.toLowerCase().replace(/ /g, '_'), agent.id).catch(console.error);
          bar.hidden = true;
        });
        bar.appendChild(btn);
      });

      card.appendChild(bar);
    }

    elList.appendChild(card);
  });
}

function updateBadge(count) {
  if (!elBadge) return;
  if (count > 0) {
    elBadge.textContent = String(count);
    elBadge.hidden = false;
  } else {
    elBadge.hidden = true;
  }
}

export const agentsPanel = {
  init,
  onAgentUpdate(agents) { renderAgents(agents); },
  onSnapshot(_html)     { /* agents are rendered from structured data, not raw snapshot */ },
  getPendingCount()     { return _pendingCount; },
};
