const FILE_ICONS = {
  js: '📜', ts: '📜', jsx: '⚛️', tsx: '⚛️',
  py: '🐍', rb: '💎', go: '🐹', rs: '⚙️',
  html: '🌐', css: '🎨', json: '📋', md: '📝',
  sh: '⚡', bash: '⚡', yml: '📄', yaml: '📄',
  png: '🖼️', jpg: '🖼️', gif: '🖼️', svg: '🎨',
  pdf: '📕', txt: '📄', log: '📋',
  default: '📄',
};

function getIcon(filename) {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  return FILE_ICONS[ext] || FILE_ICONS.default;
}

let elList;

function init() {
  elList = document.getElementById('files-list');
}

function renderFiles(html) {
  if (!elList) return;
  if (!html) {
    elList.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📁</div>
        <div class="empty-state-text">File tree not available</div>
      </div>`;
    return;
  }

  // Parse file names from snapshot HTML
  const tmp   = document.createElement('div');
  tmp.innerHTML = html;
  const items = tmp.querySelectorAll('[class*="file-item"], [class*="file-name"], [class*="tree-item"]');

  if (items.length === 0) {
    elList.innerHTML = `<div class="panel-snapshot">${html}</div>`;
    return;
  }

  elList.innerHTML = '';
  items.forEach(item => {
    const name    = item.textContent.trim();
    if (!name) return;
    const row     = document.createElement('div');
    row.className = 'file-item';

    const icon     = document.createElement('span');
    icon.className = 'file-icon';
    icon.textContent = getIcon(name);

    const label     = document.createElement('span');
    label.className = 'file-name';
    label.textContent = name;

    row.appendChild(icon);
    row.appendChild(label);

    row.addEventListener('click', () => {
      // Show simple detail toast
      const ext = name.split('.').pop();
      showFileDetail(name, ext);
    });

    elList.appendChild(row);
  });
}

function showFileDetail(name) {
  const event = new CustomEvent('show-toast', { detail: { message: name, type: 'info' } });
  document.dispatchEvent(event);
}

export const filesPanel = {
  init,
  onSnapshot(html) { renderFiles(html); },
};
