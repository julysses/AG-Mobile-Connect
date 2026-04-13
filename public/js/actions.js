import { wsClient } from './ws-client.js';
import { haptics }  from './haptics.js';

const _lastCall = {};
const DEBOUNCE  = 500;

function debounce(type) {
  const now = Date.now();
  if (now - (_lastCall[type] || 0) < DEBOUNCE) return false;
  _lastCall[type] = now;
  return true;
}

function dispatch(actionMsg) {
  return new Promise((resolve, reject) => {
    const sessionId = actionMsg.session_id || null;
    const timeout   = setTimeout(() => reject(new Error('Action timed out')), 8000);

    const onResult = (msg) => {
      if (msg.session_id && msg.session_id !== sessionId) return;
      clearTimeout(timeout);
      wsClient.off('action_result', onResult);
      if (msg.ok) resolve(msg.result);
      else reject(Object.assign(new Error(msg.error || 'Action failed'), { code: msg.code }));
    };

    wsClient.on('action_result', onResult);
    wsClient.send(actionMsg);
  });
}

export const actions = {
  sendMessage(text, sessionId) {
    if (!debounce('sendMessage')) return Promise.resolve();
    haptics.medium();
    return dispatch({ type: 'action', action: { type: 'sendMessage', value: text, session_id: sessionId } });
  },

  stopGeneration(sessionId) {
    if (!debounce('stopGeneration')) return Promise.resolve();
    haptics.heavy();
    return dispatch({ type: 'action', action: { type: 'stopGeneration', session_id: sessionId } });
  },

  clickApproval(approvalType, sessionId) {
    if (!debounce('approval_' + approvalType)) return Promise.resolve();
    haptics.heavy();
    return dispatch({ type: 'action', action: { type: 'clickApproval', target: approvalType, session_id: sessionId } });
  },

  switchModel(modelId) {
    if (!debounce('switchModel')) return Promise.resolve();
    haptics.light();
    return dispatch({ type: 'action', action: { type: 'switchModel', value: modelId } });
  },

  switchMode(mode) {
    if (!debounce('switchMode')) return Promise.resolve();
    haptics.light();
    return dispatch({ type: 'action', action: { type: 'switchMode', value: mode } });
  },

  newConversation() {
    haptics.medium();
    return dispatch({ type: 'action', action: { type: 'newConversation' } });
  },
};
