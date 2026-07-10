/**
 * User lookup for auth — Supabase `users` table with env-based demo fallback.
 */
import { createClient } from '@supabase/supabase-js';
import { hashSecret, verifySecret } from './password.js';

/**
 * @returns {import('@supabase/supabase-js').SupabaseClient | null}
 */
export function getServiceSupabase() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * @param {object} row
 */
function mapUser(row) {
  return {
    id: String(row.id),
    username: String(row.username),
    password_hash: row.password_hash ?? null,
    pin_hash: row.pin_hash ?? null,
    role: String(row.role),
    display_name: String(row.display_name || row.username || ''),
    active: row.active !== false,
    created_at: row.created_at ?? null,
  };
}

/**
 * Demo users when DB is empty / unavailable (local + first deploy).
 * Hashes are computed at runtime from env plaintext.
 */
function getDemoUsers() {
  const adminUser = String(process.env.AUTH_ADMIN_USERNAME || 'admin').trim();
  const adminPass = String(process.env.AUTH_ADMIN_PASSWORD || process.env.ADMIN_PIN || 'shamaadan');
  const staffPin = String(process.env.AUTH_STAFF_PIN || '1234').replace(/\D/g, '') || '1234';
  const staffName = String(process.env.AUTH_STAFF_NAME || 'Cashier').trim();

  return [
    {
      id: 'demo-admin',
      username: adminUser,
      password_hash: hashSecret(adminPass),
      pin_hash: null,
      role: 'admin',
      display_name: 'Administrator',
      active: true,
      created_at: new Date().toISOString(),
      _demoPlainPassword: adminPass,
    },
    {
      id: 'demo-staff',
      username: 'cashier',
      password_hash: null,
      pin_hash: hashSecret(staffPin),
      role: 'staff',
      display_name: staffName,
      active: true,
      created_at: new Date().toISOString(),
      _demoPlainPin: staffPin,
    },
  ];
}

/**
 * @param {string} username
 */
export async function findUserByUsername(username) {
  const normalized = String(username || '').trim().toLowerCase();
  if (!normalized) return null;

  const supabase = getServiceSupabase();
  if (supabase) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .ilike('username', normalized)
      .eq('active', true)
      .maybeSingle();

    if (!error && data) return mapUser(data);
  }

  const demo = getDemoUsers().find((u) => u.username.toLowerCase() === normalized);
  return demo ? mapUser(demo) : null;
}

/**
 * Verify admin credentials.
 * @param {string} username
 * @param {string} password
 */
export async function authenticateAdmin(username, password) {
  const supabase = getServiceSupabase();
  const normalized = String(username || '').trim().toLowerCase();
  const plain = String(password || '');

  if (supabase) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .ilike('username', normalized)
      .eq('active', true)
      .maybeSingle();

    if (!error && data) {
      const user = mapUser(data);
      if (user.role !== 'admin' || !user.password_hash) {
        return { ok: false, error: 'Invalid username or password' };
      }
      if (!verifySecret(plain, user.password_hash)) {
        return { ok: false, error: 'Invalid username or password' };
      }
      return { ok: true, user: publicUser(user), source: 'database' };
    }
  }

  // Demo fallback — re-hash each time so env changes apply without restart issues
  const adminUser = String(process.env.AUTH_ADMIN_USERNAME || 'admin').trim().toLowerCase();
  const adminPass = String(process.env.AUTH_ADMIN_PASSWORD || process.env.ADMIN_PIN || 'shamaadan');
  if (normalized === adminUser && plain === adminPass) {
    return {
      ok: true,
      user: {
        id: 'demo-admin',
        username: adminUser,
        role: 'admin',
        displayName: 'Administrator',
      },
      source: 'demo',
    };
  }

  return { ok: false, error: 'Invalid username or password' };
}

/**
 * Verify POS PIN → staff user.
 * @param {string} pin
 */
export async function authenticatePosPin(pin) {
  const digits = String(pin || '').replace(/\D/g, '');
  if (digits.length < 4 || digits.length > 8) {
    return { ok: false, error: 'Enter a 4–8 digit PIN' };
  }

  const supabase = getServiceSupabase();
  if (supabase) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('role', 'staff')
      .eq('active', true);

    if (!error && data?.length) {
      for (const row of data) {
        const user = mapUser(row);
        if (user.pin_hash && verifySecret(digits, user.pin_hash)) {
          return { ok: true, user: publicUser(user), source: 'database' };
        }
      }
      return { ok: false, error: 'Invalid PIN' };
    }
  }

  const staffPin = String(process.env.AUTH_STAFF_PIN || '1234').replace(/\D/g, '') || '1234';
  const staffName = String(process.env.AUTH_STAFF_NAME || 'Cashier').trim();
  if (digits === staffPin) {
    return {
      ok: true,
      user: {
        id: 'demo-staff',
        username: 'cashier',
        role: 'staff',
        displayName: staffName,
      },
      source: 'demo',
    };
  }

  return { ok: false, error: 'Invalid PIN' };
}

/**
 * @param {ReturnType<typeof mapUser>} user
 */
function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    displayName: user.display_name || user.username,
  };
}

export { hashSecret, verifySecret, getDemoUsers };
