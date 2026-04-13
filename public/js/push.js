import { wsClient } from './ws-client.js';

function urlBase64ToUint8Array(base64String) {
  const padding  = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64   = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData  = atob(base64);
  const arr      = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) arr[i] = rawData.charCodeAt(i);
  return arr;
}

async function subscribe() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    alert('Push notifications are not supported on this browser.');
    return false;
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    alert('Notification permission denied. Enable in browser settings.');
    return false;
  }

  try {
    const reg  = await navigator.serviceWorker.ready;
    const resp = await fetch('/api/push/vapid-public-key');
    const { publicKey } = await resp.json();

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly:      true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });

    // Send subscription to server
    wsClient.send({ type: 'push_subscribe', subscription: sub.toJSON() });

    document.getElementById('push-toggle-btn').textContent = 'Enabled ✓';
    document.getElementById('push-status').textContent     = 'Active';
    return true;
  } catch (err) {
    console.error('[push] Subscribe failed', err);
    alert('Push subscription failed: ' + err.message);
    return false;
  }
}

async function isSubscribed() {
  if (!('serviceWorker' in navigator)) return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return !!sub;
  } catch {
    return false;
  }
}

export const pushManager = { subscribe, isSubscribed };
