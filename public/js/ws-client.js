const BACKOFF = [1000, 2000, 4000, 8000, 16000, 30000];

const handlers = new Map(); // type → Set<handler>
let ws         = null;
let backoffIdx = 0;
let pingTimer  = null;
let lastPong   = Date.now();
let outQueue   = [];
let connected  = false;

function on(type, handler) {
  if (!handlers.has(type)) handlers.set(type, new Set());
  handlers.get(type).add(handler);
}

function off(type, handler) {
  handlers.get(type)?.delete(handler);
}

function dispatch(msg) {
  const set = handlers.get(msg.type);
  if (set) set.forEach(h => h(msg));
  // Also dispatch to '*' wildcard handlers
  const all = handlers.get('*');
  if (all) all.forEach(h => h(msg));
}

function send(message) {
  const payload = JSON.stringify(message);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(payload);
  } else {
    outQueue.push(payload);
  }
}

function drainQueue() {
  while (outQueue.length && ws?.readyState === WebSocket.OPEN) {
    ws.send(outQueue.shift());
  }
}

function setConnected(val) {
  connected = val;
  document.dispatchEvent(new CustomEvent('ws-state-change', { detail: { connected: val } }));
}

function startPing() {
  clearInterval(pingTimer);
  lastPong = Date.now();
  pingTimer = setInterval(() => {
    if (Date.now() - lastPong > 60000) {
      ws?.close();
      return;
    }
    send({ type: 'ping' });
  }, 25000);
}

function connect() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url   = `${proto}//${location.host}/ws`;

  try {
    ws = new WebSocket(url);
  } catch (e) {
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    backoffIdx = 0;
    setConnected(true);
    drainQueue();
    startPing();
    dispatch({ type: '_connected' });
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === 'pong') { lastPong = Date.now(); return; }
      dispatch(msg);
    } catch (e) {
      console.warn('[ws-client] Bad message', event.data);
    }
  };

  ws.onclose = () => {
    clearInterval(pingTimer);
    setConnected(false);
    dispatch({ type: '_disconnected' });
    scheduleReconnect();
  };

  ws.onerror = () => {
    // onclose will fire after onerror
  };
}

function scheduleReconnect() {
  const delay = BACKOFF[Math.min(backoffIdx, BACKOFF.length - 1)];
  backoffIdx++;
  setTimeout(connect, delay);
}

// Force reconnect when tab comes back to foreground
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !connected) {
    backoffIdx = 0;
    connect();
  }
});

export const wsClient = {
  connect,
  send,
  on,
  off,
  isConnected: () => connected,
};
