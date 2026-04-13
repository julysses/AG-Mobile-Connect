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

  // Parse file names from snapshot HTML (supporting various IDE snapshot structures)
  const tmp   = document.createElement('div');
  tmp.innerHTML = html;
  
  // IDE Snapshot usually uses .label-name or .p-TreeViewNode-label
  const items = tmp.querySelectorAll('[class*="file-item"], [class*="file-name"], [class*="tree-item"], [class*="label-name"], [class*="TreeViewNode"]');

  if (items.length === 0) {
    // If we can't parse it into a list, show the raw snapshot but keep it themed
    elList.innerHTML = `<div class="panel-snapshot explorer-fallback">${html}</div>`;
    return;
  }

  elList.innerHTML = '<div class="files-panel-header">Explorer</div>';
  const listWrap = document.createElement('div');
  listWrap.className = 'files-list';

  items.forEach(item => {
    const name    = item.textContent.trim();
    if (!name) return;
    const ext     = (name.split('.').pop() || '').toLowerCase();
    
    const row     = document.createElement('div');
    row.className = 'file-item';
    row.dataset.ext = ext;

    const icon     = document.createElement('span');
    icon.className = 'file-icon';
    icon.textContent = getIcon(name);

    const label     = document.createElement('span');
    label.className = 'file-name';
    label.textContent = name;

    row.appendChild(icon);
    row.appendChild(label);

    row.addEventListener('click', () => {
      showFileDetail(name, ext);
    });

    listWrap.appendChild(row);
  });
  elList.appendChild(listWrap);
}

function showFileDetail(name) {
  const event = new CustomEvent('show-toast', { detail: { message: name, type: 'info' } });
  document.dispatchEvent(event);
}

export const filesPanel = {
  init,
  onSnapshot(html) { renderFiles(html); },
};
