let elOutput, elSearch, elScrollBtn;
let _autoScroll = true;
let _rawContent = '';

// Minimal ANSI-to-HTML converter
const ANSI_COLORS = {
  30: 'ansi-black',  31: 'ansi-red',   32: 'ansi-green',  33: 'ansi-yellow',
  34: 'ansi-blue',   35: 'ansi-magenta',36: 'ansi-cyan',  37: 'ansi-white',
  90: 'ansi-black',  91: 'ansi-red',   92: 'ansi-green',  93: 'ansi-yellow',
  94: 'ansi-blue',   95: 'ansi-magenta',96: 'ansi-cyan',  97: 'ansi-white',
};

function ansiToHtml(text) {
  // Escape HTML first
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Replace ANSI escape sequences
  return escaped.replace(/\x1b\[([0-9;]*)m/g, (_match, codes) => {
    if (!codes || codes === '0') return '</span>';
    const parts = codes.split(';').map(Number);
    const classes = [];
    for (const code of parts) {
      if (code === 1)  classes.push('ansi-bold');
      if (code === 2)  classes.push('ansi-dim');
      if (ANSI_COLORS[code]) classes.push(ANSI_COLORS[code]);
    }
    return classes.length ? `<span class="${classes.join(' ')}">` : '';
  });
}

function highlightErrors(html) {
  return html.replace(/^(.*(error|Error|failed|FAILED).*)$/gm,
    '<span class="line-error">$1</span>');
}

function renderTerminal(content) {
  _rawContent   = content;
  const html    = highlightErrors(ansiToHtml(content));
  elOutput.innerHTML = html;
  if (_autoScroll) elOutput.scrollTop = elOutput.scrollHeight;
}

function init() {
  elOutput    = document.getElementById('terminal-output');
  elSearch    = document.getElementById('terminal-search');
  elScrollBtn = document.getElementById('scroll-bottom-btn');

  elOutput.addEventListener('scroll', () => {
    const atBottom = elOutput.scrollHeight - elOutput.scrollTop - elOutput.clientHeight < 40;
    _autoScroll        = atBottom;
    elScrollBtn.hidden = atBottom;
  });

  elScrollBtn.addEventListener('click', () => {
    elOutput.scrollTop = elOutput.scrollHeight;
    _autoScroll = true;
    elScrollBtn.hidden = true;
  });

  elSearch.addEventListener('input', () => {
    const query = elSearch.value.trim();
    if (!query) {
      renderTerminal(_rawContent);
      return;
    }
    // Highlight matching lines
    const re   = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    const html = highlightErrors(ansiToHtml(_rawContent))
      .replace(re, m => `<mark style="background:var(--warning);color:#000">${m}</mark>`);
    elOutput.innerHTML = html;
  });

  // Long-press to copy line
  let pressTimer;
  elOutput.addEventListener('touchstart', (e) => {
    pressTimer = setTimeout(() => {
      const line = e.target.closest('[data-line]');
      if (line) navigator.clipboard?.writeText(line.textContent);
    }, 600);
  });
  elOutput.addEventListener('touchend', () => clearTimeout(pressTimer));
}

export const terminalPanel = {
  init,

  onSnapshot(html) {
    if (!elOutput) return;
    // Extract text content from snapshot HTML for rendering
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    const text = tmp.textContent || tmp.innerText || '';
    if (text) renderTerminal(text);
  },
};
