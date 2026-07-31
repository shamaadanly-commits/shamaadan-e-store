/**
 * Client auth helpers — talks to unified /api/auth?action=…
 * Falls back to remembered offline credentials when the network is down.
 */
import {
  rememberOfflineLogin,
  tryOfflineAdminLogin,
  tryOfflinePosLogin,
} from './offline.js';

const LOCAL_ADMIN_KEY = 'shamaadan_admin_session_local';
const LOCAL_POS_KEY = 'shamaadan_pos_session_local';
const ADMIN_LOCAL_HOURS = 12;
const POS_LOCAL_HOURS = 16;

/**
 * @param {string} path
 * @param {RequestInit} [init]
 */
async function api(path, init = {}) {
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
    ...init,
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  return { res, data, unreachable: false };
}

/**
 * @param {string} path
 * @param {RequestInit} [init]
 */
async function apiSafe(path, init = {}) {
  try {
    return await api(path, init);
  } catch {
    return { res: null, data: null, unreachable: true };
  }
}

function saveLocalSession(key, user, hours) {
  if (!user) return;
  sessionStorage.setItem(key, JSON.stringify({
    user,
    exp: new Date(Date.now() + hours * 60 * 60 * 1000).toISOString(),
  }));
}

/**
 * @param {'admin' | 'pos'} scope
 * @returns {{ authenticated: true, user: object, source: 'local' } | null}
 */
function readLocalSession(scope) {
  const key = scope === 'admin' ? LOCAL_ADMIN_KEY : LOCAL_POS_KEY;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.user || (parsed.exp && Date.parse(parsed.exp) <= Date.now())) {
      sessionStorage.removeItem(key);
      return null;
    }
    return { authenticated: true, user: parsed.user, source: 'local' };
  } catch {
    sessionStorage.removeItem(key);
    return null;
  }
}

function localKeyForScope(scope) {
  return scope === 'admin' ? LOCAL_ADMIN_KEY : LOCAL_POS_KEY;
}

function localHoursForScope(scope) {
  return scope === 'admin' ? ADMIN_LOCAL_HOURS : POS_LOCAL_HOURS;
}

function demoAdminCredentials() {
  return {
    username: String(window.__ENV__?.AUTH_ADMIN_USERNAME || 'admin').trim().toLowerCase(),
    password: String(window.__ENV__?.ADMIN_PIN || 'shamaadan'),
  };
}

function demoStaffPin() {
  return String(window.__ENV__?.AUTH_STAFF_PIN || '1234').replace(/\D/g, '') || '1234';
}

function demoStaffName() {
  return String(window.__ENV__?.AUTH_STAFF_NAME || 'Cashier').trim();
}

/**
 * @param {'admin' | 'pos'} scope
 * @returns {Promise<{
 *   authenticated: boolean,
 *   user: object | null,
 *   source?: string,
 *   soft?: boolean,
 * }>}
 */
export async function fetchSession(scope) {
  const { res, data, unreachable } = await apiSafe(`/api/auth?action=session&scope=${scope}`);
  const local = readLocalSession(scope);

  // Network / API down — keep the user signed in from the local backup.
  if (unreachable) {
    if (local) return { ...local, soft: true };
    return { authenticated: false, user: null, soft: true };
  }

  // Healthy server session — refresh local backup so brief outages don't kick the user.
  if (res?.ok && data?.authenticated && data?.user) {
    saveLocalSession(localKeyForScope(scope), data.user, localHoursForScope(scope));
    return { authenticated: true, user: data.user, source: 'server' };
  }

  // Explicit unauthenticated from the auth API.
  if (res?.status === 401 && data?.authenticated === false) {
    // Prefer a still-valid local backup (covers cookie/secret glitches after a fresh login).
    if (local) return { ...local, soft: true };
    return { authenticated: false, user: null };
  }

  // 5xx / HTML error / unexpected response — do not treat as logout.
  if (local) return { ...local, soft: true };
  return { authenticated: false, user: null, soft: true };
}

/**
 * @param {string} username
 * @param {string} password
 */
export async function loginAdmin(username, password) {
  const { res, data, unreachable } = await apiSafe('/api/auth?action=login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });

  if (!unreachable && res) {
    if (res.ok && data?.ok) {
      // Keep a local backup even after cookie login — session watch must survive API blips.
      saveLocalSession(LOCAL_ADMIN_KEY, data.user, ADMIN_LOCAL_HOURS);
      await rememberOfflineLogin('admin', {
        username,
        password,
        user: data.user,
      });
      return { ok: true, user: data.user, source: data.source || 'server' };
    }
    if (res.status === 401 || res.status === 400) {
      return { ok: false, error: data?.error || 'Invalid username or password' };
    }
  }

  const offline = await tryOfflineAdminLogin(username, password);
  if (offline.ok) {
    saveLocalSession(LOCAL_ADMIN_KEY, offline.user, ADMIN_LOCAL_HOURS);
    return offline;
  }

  const demo = demoAdminCredentials();
  if (String(username).trim().toLowerCase() === demo.username && String(password) === demo.password) {
    const user = {
      id: 'demo-admin',
      username: demo.username,
      role: 'admin',
      displayName: 'Administrator',
    };
    saveLocalSession(LOCAL_ADMIN_KEY, user, ADMIN_LOCAL_HOURS);
    await rememberOfflineLogin('admin', { username, password, user });
    return { ok: true, user, source: 'local' };
  }

  return { ok: false, error: offline.error || 'Invalid username or password' };
}

/**
 * @param {string} pin
 */
export async function loginPosPin(pin) {
  const digits = String(pin || '').replace(/\D/g, '');
  const { res, data, unreachable } = await apiSafe('/api/auth?action=pin', {
    method: 'POST',
    body: JSON.stringify({ pin: digits }),
  });

  if (!unreachable && res) {
    if (res.ok && data?.ok) {
      saveLocalSession(LOCAL_POS_KEY, data.user, POS_LOCAL_HOURS);
      await rememberOfflineLogin('pos', {
        pin: digits,
        user: data.user,
      });
      return { ok: true, user: data.user, source: data.source || 'server' };
    }
    if (res.status === 401 || res.status === 400) {
      return { ok: false, error: data?.error || 'Invalid PIN' };
    }
  }

  const offline = await tryOfflinePosLogin(digits);
  if (offline.ok) {
    saveLocalSession(LOCAL_POS_KEY, offline.user, POS_LOCAL_HOURS);
    return offline;
  }

  if (digits === demoStaffPin()) {
    const user = {
      id: 'demo-staff',
      username: 'cashier',
      role: 'staff',
      displayName: demoStaffName(),
    };
    saveLocalSession(LOCAL_POS_KEY, user, POS_LOCAL_HOURS);
    await rememberOfflineLogin('pos', { pin: digits, user });
    return { ok: true, user, source: 'local' };
  }

  return { ok: false, error: offline.error || 'Invalid PIN' };
}

/**
 * Confirm admin PIN for sensitive actions (no session created).
 * @param {string} pin
 */
export async function verifyAdminPin(pin) {
  const secret = String(pin || '').trim();
  const { res, data, unreachable } = await apiSafe('/api/auth?action=verify-admin-pin', {
    method: 'POST',
    body: JSON.stringify({ pin: secret }),
  });

  if (!unreachable && res) {
    if (res.ok && data?.ok) {
      return { ok: true, user: data.user, source: data.source || 'server' };
    }
    if (res.status === 401 || res.status === 400) {
      return { ok: false, error: data?.error || 'Invalid admin PIN' };
    }
  }

  const demo = demoAdminCredentials();
  if (secret === demo.password || secret.replace(/\D/g, '') === String(demo.password).replace(/\D/g, '')) {
    return {
      ok: true,
      user: {
        id: 'demo-admin',
        username: demo.username,
        role: 'admin',
        displayName: 'Administrator',
      },
      source: 'local',
    };
  }

  return { ok: false, error: 'Invalid admin PIN' };
}

/**
 * Change admin / dashboard password (requires signed-in admin session).
 * @param {{ username?: string, currentPassword: string, newPassword: string }} input
 */
export async function changeAdminPasswordClient(input) {
  const { res, data, unreachable } = await apiSafe('/api/auth?action=change-admin-password', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  if (unreachable || !res) return { ok: false, error: 'Auth server unreachable' };
  if (res.ok && data?.ok) {
    if (input?.newPassword) {
      await rememberOfflineLogin('admin', {
        username: input.username,
        password: input.newPassword,
        user: { id: 'admin', username: String(input.username || 'admin').toLowerCase(), role: 'admin', displayName: 'Administrator' },
      });
    }
    return { ok: true, message: data.message };
  }
  return { ok: false, error: data?.error || 'Could not update password' };
}

/**
 * Change POS unlock PIN.
 * @param {{ adminPassword: string, newPin: string, staffName?: string }} input
 */
export async function changePosPinClient(input) {
  const { res, data, unreachable } = await apiSafe('/api/auth?action=change-pos-pin', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  if (unreachable || !res) return { ok: false, error: 'Auth server unreachable' };
  if (res.ok && data?.ok) {
    if (input?.newPin) {
      await rememberOfflineLogin('pos', {
        pin: input.newPin,
        user: {
          id: 'staff',
          username: 'cashier',
          role: 'staff',
          displayName: input.staffName || 'Cashier',
        },
      });
    }
    return { ok: true, message: data.message };
  }
  return { ok: false, error: data?.error || 'Could not update POS PIN' };
}

/**
 * Change admin confirmation PIN (invoice refunds).
 * @param {{ adminPassword: string, newPin: string }} input
 */
export async function changeAdminPinClient(input) {
  const { res, data, unreachable } = await apiSafe('/api/auth?action=change-admin-pin', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  if (unreachable || !res) return { ok: false, error: 'Auth server unreachable' };
  if (res.ok && data?.ok) return { ok: true, message: data.message };
  return { ok: false, error: data?.error || 'Could not update admin PIN' };
}

/**
 * @param {'admin' | 'pos' | 'both'} [scope]
 */
export async function logout(scope = 'both') {
  if (scope === 'admin' || scope === 'both') {
    sessionStorage.removeItem(LOCAL_ADMIN_KEY);
  }
  if (scope === 'pos' || scope === 'both') {
    sessionStorage.removeItem(LOCAL_POS_KEY);
  }

  await apiSafe('/api/auth?action=logout', {
    method: 'POST',
    body: JSON.stringify({ scope }),
  });
}
