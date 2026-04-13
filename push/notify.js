'use strict';

const webPush     = require('web-push');
const logger      = require('../utils/logger').child('Push');
const subscriptions = require('./subscriptions');

const config = require('../config/default.json');

async function send(title, body, data = {}) {
  if (!config.push.enabled) {
    logger.debug('Push disabled, skipping notification');
    return;
  }

  const subs = subscriptions.getAll();
  if (subs.length === 0) {
    logger.debug('No push subscribers');
    return;
  }

  const payload = JSON.stringify({ title, body, data, timestamp: Date.now() });

  const results = await Promise.allSettled(
    subs.map(sub =>
      webPush.sendNotification(sub, payload).catch(err => {
        // Auto-remove expired/invalid subscriptions
        if (err.statusCode === 410 || err.statusCode === 404) {
          logger.info(`Removing expired subscription: ${sub.endpoint.slice(0, 40)}...`);
          subscriptions.remove(sub.endpoint);
        } else {
          logger.warn('Push delivery failed', { statusCode: err.statusCode, err: err.message });
        }
        throw err;
      })
    )
  );

  const succeeded = results.filter(r => r.status === 'fulfilled').length;
  const failed    = results.filter(r => r.status === 'rejected').length;
  logger.debug(`Push sent: ${succeeded} ok, ${failed} failed`);
}

function sendGenerationComplete(sessionId, durationMs) {
  return send(
    '✅ Done',
    'Agent finished. Tap to review.',
    { type: 'generation_complete', sessionId, durationMs, panel: 'chat' }
  );
}

function sendApprovalNeeded(context, sessionId) {
  return send(
    '🔔 Action Required',
    'Agent needs your approval.',
    { type: 'approval_needed', context, sessionId, panel: 'agents' }
  );
}

function sendAgentError(agentName, errorMsg) {
  return send(
    '⚠️ Agent Error',
    `${agentName || 'Agent'} hit an error. Tap to see.`,
    { type: 'agent_error', agentName, error: errorMsg, panel: 'terminal' }
  );
}

function sendTunnelRestarted(newUrl) {
  return send(
    '🔄 Reconnected',
    'Tunnel restarted. New URL available.',
    { type: 'tunnel_restarted', newUrl, panel: 'settings' }
  );
}

module.exports = { send, sendGenerationComplete, sendApprovalNeeded, sendAgentError, sendTunnelRestarted };
