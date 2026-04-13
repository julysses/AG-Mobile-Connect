'use strict';

const { EventEmitter } = require('events');
const logger = require('./logger').child('Health');

const startTime = Date.now();

const state = {
  cdp:    { status: 'disconnected', since: new Date().toISOString(), meta: {} },
  tunnel: { status: 'stopped',      since: new Date().toISOString(), url: null },
  push:   { status: 'disabled',     subscribers: 0 },
  server: { status: 'starting',     startTime: new Date().toISOString() },
};

class HealthEmitter extends EventEmitter {}
const emitter = new HealthEmitter();

function setState(component, status, meta = {}) {
  if (!state[component]) {
    logger.warn(`Unknown component: ${component}`);
    return;
  }
  const prev = state[component].status;
  state[component] = {
    ...state[component],
    status,
    since: new Date().toISOString(),
    ...meta,
  };
  if (prev !== status) {
    logger.debug(`${component} ${prev} → ${status}`);
    emitter.emit('change', { component, status, previous: prev, state: getState() });
  }
}

function getState() {
  return {
    cdp:    { ...state.cdp },
    tunnel: { ...state.tunnel },
    push:   { ...state.push },
    server: { ...state.server },
    uptime: getUptime(),
  };
}

function isHealthy(component) {
  if (!component) {
    return state.cdp.status === 'connected' && state.server.status === 'running';
  }
  const healthy = { cdp: 'connected', tunnel: 'active', push: 'enabled', server: 'running' };
  return state[component]?.status === healthy[component];
}

function getUptime() {
  return Math.floor((Date.now() - startTime) / 1000);
}

function on(event, handler) {
  emitter.on(event, handler);
}

module.exports = { setState, getState, isHealthy, getUptime, on };
