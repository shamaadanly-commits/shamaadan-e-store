/**
 * Offline helpers for Admin + POS.
 * - Cache catalog after a successful online sync
 * - Remember last successful login (hashed) for offline unlock
 * - Queue POS sales made while offline and flush when back online
 */

const CATALOG_KEY = 'shamaadan_offline_catalog_v1';
const SALES_QUEUE_KEY = 'shamaadan_offline_sales_queue_v1';
const ADMIN_CRED_KEY = 'shamaadan_offline_admin_cred_v1';
const POS_CRED_KEY = 'shamaadan_offline_pos_cred_v1';
const ENV_KEY = 'shamaadan_offline_env_v1';

export function isOnline() {
  return typeof navigator === 'undefined' ? true : navigator.onLine !== false;
}

/**
 * @param {string} value
 * @returns {Promise<string>}
 */
export async function hashSecret(value) {
  const raw = String(value || '');
  if (!raw) return '';
  if (globalThis.crypto?.subtle) {
    const data = new TextEncoder().encode(raw);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Rare fallback (old browsers)
  let h = 0;
  for (let i = 0; i < raw.length; i += 1) h = ((h << 5) - h) + raw.charCodeAt(i);
  return `fallback_${h >>> 0}`;
}

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    console.warn('[offline] storage write failed:', err?.message || err);
    return false;
  }
}

/** Persist public env so /api/env.js is not required offline. */
export function persistEnv(env = window.__ENV__) {
  if (!env || typeof env !== 'object') return;
  const slim = {};
  for (const [k, v] of Object.entries(env)) {
    if (v == null || v === '') continue;
    // Never persist service-role style secrets if they ever leak into __ENV__
    if (/SERVICE_ROLE|SECRET|PRIVATE/i.test(k)) continue;
    slim[k] = String(v);
  }
  writeJson(ENV_KEY, { env: slim, savedAt: new Date().toISOString() });
}

export function restoreEnv() {
  const cached = readJson(ENV_KEY, null);
  if (!cached?.env) return false;
  window.__ENV__ = { ...(window.__ENV__ || {}), ...cached.env };
  return true;
}

/**
 * @param {{ products?: any[], categories?: any[], collections?: any[] }} catalog
 */
export function saveOfflineCatalog(catalog) {
  if (!catalog) return;
  writeJson(CATALOG_KEY, {
    products: Array.isArray(catalog.products) ? catalog.products : [],
    categories: Array.isArray(catalog.categories) ? catalog.categories : [],
    collections: Array.isArray(catalog.collections) ? catalog.collections : [],
    savedAt: new Date().toISOString(),
  });
}

export function loadOfflineCatalog() {
  const cached = readJson(CATALOG_KEY, null);
  if (!cached || !Array.isArray(cached.products)) return null;
  return cached;
}

/**
 * @param {'admin' | 'pos'} scope
 * @param {{ user: object, username?: string, password?: string, pin?: string }} payload
 */
export async function rememberOfflineLogin(scope, payload) {
  if (!payload?.user) return;
  if (scope === 'admin') {
    const username = String(payload.username || payload.user.username || '').trim().toLowerCase();
    const passwordHash = await hashSecret(payload.password || '');
    if (!username || !passwordHash) return;
    writeJson(ADMIN_CRED_KEY, {
      username,
      passwordHash,
      user: payload.user,
      savedAt: new Date().toISOString(),
    });
    return;
  }

  const pinHash = await hashSecret(String(payload.pin || '').replace(/\D/g, ''));
  if (!pinHash) return;
  writeJson(POS_CRED_KEY, {
    pinHash,
    user: payload.user,
    savedAt: new Date().toISOString(),
  });
}

/**
 * @param {string} username
 * @param {string} password
 */
export async function tryOfflineAdminLogin(username, password) {
  const cached = readJson(ADMIN_CRED_KEY, null);
  if (!cached?.username || !cached?.passwordHash || !cached?.user) {
    return { ok: false, error: 'No offline admin login saved. Connect once online first.' };
  }
  const name = String(username || '').trim().toLowerCase();
  const passwordHash = await hashSecret(password);
  if (name !== cached.username || passwordHash !== cached.passwordHash) {
    return { ok: false, error: 'Invalid username or password' };
  }
  return { ok: true, user: cached.user, source: 'offline' };
}

/**
 * @param {string} pin
 */
export async function tryOfflinePosLogin(pin) {
  const cached = readJson(POS_CRED_KEY, null);
  if (!cached?.pinHash || !cached?.user) {
    return { ok: false, error: 'No offline POS PIN saved. Unlock once online first.' };
  }
  const pinHash = await hashSecret(String(pin || '').replace(/\D/g, ''));
  if (pinHash !== cached.pinHash) {
    return { ok: false, error: 'Invalid PIN' };
  }
  return { ok: true, user: cached.user, source: 'offline' };
}

/**
 * @param {object} sale
 */
export function enqueueOfflineSale(sale) {
  const queue = readJson(SALES_QUEUE_KEY, []);
  const list = Array.isArray(queue) ? queue : [];
  const entry = {
    id: sale.id || `offline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    ...sale,
  };
  list.push(entry);
  writeJson(SALES_QUEUE_KEY, list);
  return entry;
}

export function getOfflineSalesQueue() {
  const queue = readJson(SALES_QUEUE_KEY, []);
  return Array.isArray(queue) ? queue : [];
}

export function setOfflineSalesQueue(queue) {
  writeJson(SALES_QUEUE_KEY, Array.isArray(queue) ? queue : []);
}

/**
 * @param {(entry: object) => Promise<boolean>} syncOne
 * @returns {Promise<{ synced: number, remaining: number }>}
 */
export async function flushOfflineSalesQueue(syncOne) {
  const queue = getOfflineSalesQueue();
  if (!queue.length) return { synced: 0, remaining: 0 };

  const remaining = [];
  let synced = 0;
  for (const entry of queue) {
    try {
      const ok = await syncOne(entry);
      if (ok) synced += 1;
      else remaining.push(entry);
    } catch (err) {
      console.warn('[offline] sale sync failed:', err?.message || err);
      remaining.push(entry);
    }
  }
  setOfflineSalesQueue(remaining);
  return { synced, remaining: remaining.length };
}

/**
 * Attach online/offline UI helpers.
 * @param {HTMLElement} root
 * @param {{ onOnline?: () => void | Promise<void> }} [opts]
 */
export function bindConnectivity(root, opts = {}) {
  if (!root) return () => {};

  const banner = document.createElement('div');
  banner.className = 'offline-banner';
  banner.hidden = true;
  banner.setAttribute('role', 'status');
  banner.innerHTML = '<span data-offline-banner-text>Offline mode — changes sync when you reconnect</span>';
  root.prepend(banner);

  const update = () => {
    const offline = !isOnline();
    banner.hidden = !offline;
    root.classList.toggle('is-offline', offline);
  };

  const onOnline = async () => {
    update();
    try {
      await opts.onOnline?.();
    } catch (err) {
      console.warn('[offline] onOnline failed:', err?.message || err);
    }
  };

  window.addEventListener('online', onOnline);
  window.addEventListener('offline', update);
  update();

  return () => {
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', update);
    banner.remove();
  };
}
