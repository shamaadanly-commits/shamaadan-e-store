/**
 * Client auth helpers — talks to /api/auth/* with offline demo fallback
 * when serverless routes are unavailable (e.g. static `npm run dev`).
 */

const LOCAL_ADMIN_KEY = 'shamaadan_admin_session_local';
const LOCAL_POS_KEY = 'shamaadan_pos_session_local';

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
 */
export async function fetchSession(scope) {
  const { res, data, unreachable } = await apiSafe(`/api/auth/session?scope=${scope}`);

  if (!unreachable && res?.ok && data?.authenticated) {
    return { authenticated: true, user: data.user, source: 'server' };
  }

  // Local offline session (static serve)
  const key = scope === 'admin' ? LOCAL_ADMIN_KEY : LOCAL_POS_KEY;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return { authenticated: false, user: null };
    const parsed = JSON.parse(raw);
    if (!parsed?.user || (parsed.exp && Date.parse(parsed.exp) <= Date.now())) {
      sessionStorage.removeItem(key);
      return { authenticated: false, user: null };
    }
    return { authenticated: true, user: parsed.user, source: 'local' };
  } catch {
    return { authenticated: false, user: null };
  }
}

/**
 * @param {string} username
 * @param {string} password
 */
export async function loginAdmin(username, password) {
  const { res, data, unreachable } = await apiSafe('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });

  if (!unreachable && res) {
    if (res.ok && data?.ok) {
      sessionStorage.removeItem(LOCAL_ADMIN_KEY);
      return { ok: true, user: data.user, source: data.source || 'server' };
    }
    // Real API responded with auth failure
    if (res.status === 401 || res.status === 400) {
      return { ok: false, error: data?.error || 'Invalid username or password' };
    }
  }

  // Offline / static-host fallback
  const demo = demoAdminCredentials();
  if (String(username).trim().toLowerCase() === demo.username && String(password) === demo.password) {
    const user = {
      id: 'demo-admin',
      username: demo.username,
      role: 'admin',
      displayName: 'Administrator',
    };
    sessionStorage.setItem(LOCAL_ADMIN_KEY, JSON.stringify({
      user,
      exp: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
    }));
    return { ok: true, user, source: 'local' };
  }

  return { ok: false, error: 'Invalid username or password' };
}

/**
 * @param {string} pin
 */
export async function loginPosPin(pin) {
  const digits = String(pin || '').replace(/\D/g, '');
  const { res, data, unreachable } = await apiSafe('/api/auth/pin', {
    method: 'POST',
    body: JSON.stringify({ pin: digits }),
  });

  if (!unreachable && res) {
    if (res.ok && data?.ok) {
      sessionStorage.removeItem(LOCAL_POS_KEY);
      return { ok: true, user: data.user, source: data.source || 'server' };
    }
    if (res.status === 401 || res.status === 400) {
      return { ok: false, error: data?.error || 'Invalid PIN' };
    }
  }

  if (digits === demoStaffPin()) {
    const user = {
      id: 'demo-staff',
      username: 'cashier',
      role: 'staff',
      displayName: demoStaffName(),
    };
    sessionStorage.setItem(LOCAL_POS_KEY, JSON.stringify({
      user,
      exp: new Date(Date.now() + 16 * 60 * 60 * 1000).toISOString(),
    }));
    return { ok: true, user, source: 'local' };
  }

  return { ok: false, error: 'Invalid PIN' };
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

  await apiSafe('/api/auth/logout', {
    method: 'POST',
    body: JSON.stringify({ scope }),
  });
}
