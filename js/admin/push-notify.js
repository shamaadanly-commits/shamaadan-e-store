/**
 * Admin Web Push — enable alerts for new online orders.
 */

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

async function api(action, body) {
  const res = await fetch(`/api/push?action=${encodeURIComponent(action)}`, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

/**
 * @returns {Promise<{ configured: boolean, publicKey: string | null }>}
 */
export async function fetchPushConfig() {
  const { data } = await api('public-key');
  return {
    configured: Boolean(data?.configured && data?.publicKey),
    publicKey: data?.publicKey || null,
  };
}

/**
 * @param {string} publicKey
 */
export async function enableOrderPush(publicKey) {
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('This browser does not support push notifications.');
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notification permission was denied.');
  }

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }

  const json = sub.toJSON();
  const { res, data } = await api('subscribe', {
    endpoint: json.endpoint,
    keys: json.keys,
    label: 'admin',
  });
  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || 'Could not save push subscription.');
  }

  try {
    localStorage.setItem('shamaadan-push-enabled', '1');
  } catch {
    /* ignore */
  }
  return true;
}

export async function disableOrderPush() {
  if (!('serviceWorker' in navigator)) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    const endpoint = sub.endpoint;
    await sub.unsubscribe().catch(() => {});
    await api('unsubscribe', { endpoint });
  }
  try {
    localStorage.removeItem('shamaadan-push-enabled');
  } catch {
    /* ignore */
  }
}

export async function sendTestPush() {
  const { res, data } = await api('test', {});
  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || 'Test push failed.');
  }
  return data.result;
}

/**
 * In-tab / installed-app alert when a new online order appears while admin is open.
 * Works even without VAPID (uses Notification API locally).
 * @param {object[]} orders
 * @param {{ knownIds: Set<string>, primed: boolean }} state
 */
export function detectNewWebsiteOrders(orders, state) {
  const list = Array.isArray(orders) ? orders : [];
  const ids = list.map((o) => String(o.id));

  if (!state.primed) {
    ids.forEach((id) => state.knownIds.add(id));
    state.primed = true;
    return [];
  }

  const fresh = list.filter((o) => {
    const id = String(o.id);
    if (state.knownIds.has(id)) return false;
    state.knownIds.add(id);
    return String(o.source || 'online').toLowerCase() === 'online'
      || !o.source;
  });

  // Cap known set growth
  if (state.knownIds.size > 400) {
    const keep = ids.slice(0, 200);
    state.knownIds = new Set(keep);
  }

  return fresh;
}

/**
 * @param {object} order
 */
export function showLocalOrderNotification(order) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const invoice = order.invoice_number || String(order.id || '').slice(0, 8);
  const total = Number(order.total_amount);
  const body = [
    invoice,
    order.customer_name ? String(order.customer_name) : '',
    Number.isFinite(total) ? `${total.toFixed(2)} LYD` : '',
  ].filter(Boolean).join(' · ');

  try {
    const n = new Notification('New online order', {
      body,
      tag: `order-${order.id}`,
      icon: '/assets/images/logo.png',
      data: { url: '/?app=admin&view=website-orders' },
    });
    n.onclick = () => {
      window.focus();
      n.close();
      if (!window.location.search.includes('website-orders')) {
        window.location.href = '/?app=admin&view=website-orders';
      }
    };
  } catch {
    /* ignore */
  }
}
