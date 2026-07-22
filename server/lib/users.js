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
 * Verify admin PIN / password for sensitive POS actions (refunds).
 * Does not create a session — confirmation only.
 * @param {string} pin
 */
export async function authenticateAdminPin(pin) {
  const secret = String(pin || '').trim();
  if (!secret) {
    return { ok: false, error: 'Enter admin PIN' };
  }

  const digits = secret.replace(/\D/g, '');

  const supabase = getServiceSupabase();
  if (supabase) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('role', 'admin')
      .eq('active', true);

    if (!error && data?.length) {
      for (const row of data) {
        const user = mapUser(row);
        if (user.pin_hash && digits.length >= 4 && verifySecret(digits, user.pin_hash)) {
          return { ok: true, user: publicUser(user), source: 'database' };
        }
        if (user.password_hash && verifySecret(secret, user.password_hash)) {
          return { ok: true, user: publicUser(user), source: 'database' };
        }
      }
    }
  }

  const expected = String(
    process.env.AUTH_ADMIN_PIN
    || process.env.ADMIN_PIN
    || process.env.AUTH_ADMIN_PASSWORD
    || 'shamaadan',
  ).trim();

  if (secret === expected || (digits.length >= 4 && digits === expected.replace(/\D/g, '') && expected.replace(/\D/g, '').length >= 4)) {
    return {
      ok: true,
      user: {
        id: 'demo-admin',
        username: String(process.env.AUTH_ADMIN_USERNAME || 'admin').trim().toLowerCase(),
        role: 'admin',
        displayName: 'Administrator',
      },
      source: 'demo',
    };
  }

  return { ok: false, error: 'Invalid admin PIN' };
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

/**
 * Upsert admin password into the users table (creates row if demo-only until now).
 * @param {{ username: string, currentPassword: string, newPassword: string }} input
 */
export async function changeAdminPassword(input) {
  const username = String(input?.username || '').trim().toLowerCase();
  const currentPassword = String(input?.currentPassword || '');
  const newPassword = String(input?.newPassword || '');

  if (!username) return { ok: false, error: 'Username is required' };
  if (newPassword.length < 6) return { ok: false, error: 'New password must be at least 6 characters' };
  if (newPassword === currentPassword) {
    return { ok: false, error: 'New password must be different from the current password' };
  }

  const auth = await authenticateAdmin(username, currentPassword);
  if (!auth.ok) return { ok: false, error: 'Current password is incorrect' };

  const supabase = getServiceSupabase();
  if (!supabase) {
    return {
      ok: false,
      error: 'Supabase service role is required to save passwords. Set SUPABASE_SERVICE_ROLE_KEY, then try again.',
    };
  }

  const password_hash = hashSecret(newPassword);
  const { data: existing } = await supabase
    .from('users')
    .select('id, username')
    .ilike('username', username)
    .eq('role', 'admin')
    .maybeSingle();

  if (existing?.id) {
    const { error } = await supabase
      .from('users')
      .update({
        password_hash,
        active: true,
      })
      .eq('id', existing.id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase.from('users').insert({
      username,
      password_hash,
      role: 'admin',
      display_name: 'Administrator',
      active: true,
    });
    if (error) return { ok: false, error: error.message };
  }

  return { ok: true, username };
}

/**
 * Set / reset the POS staff unlock PIN (upserts cashier staff user).
 * @param {{ adminUsername: string, adminPassword: string, newPin: string, staffName?: string }} input
 */
export async function changePosPin(input) {
  const adminUsername = String(input?.adminUsername || '').trim().toLowerCase();
  const adminPassword = String(input?.adminPassword || '');
  const newPin = String(input?.newPin || '').replace(/\D/g, '');
  const staffName = String(input?.staffName || process.env.AUTH_STAFF_NAME || 'Cashier').trim() || 'Cashier';

  if (newPin.length < 4 || newPin.length > 8) {
    return { ok: false, error: 'POS PIN must be 4–8 digits' };
  }

  const auth = await authenticateAdmin(adminUsername, adminPassword);
  if (!auth.ok) return { ok: false, error: 'Admin password is incorrect' };

  const supabase = getServiceSupabase();
  if (!supabase) {
    return {
      ok: false,
      error: 'Supabase service role is required to save the POS PIN. Set SUPABASE_SERVICE_ROLE_KEY, then try again.',
    };
  }

  const pin_hash = hashSecret(newPin);
  const staffUsername = 'cashier';

  const { data: existing } = await supabase
    .from('users')
    .select('id')
    .eq('role', 'staff')
    .ilike('username', staffUsername)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await supabase
      .from('users')
      .update({ pin_hash, display_name: staffName, active: true })
      .eq('id', existing.id);
    if (error) return { ok: false, error: error.message };
  } else {
    // Also update any other active staff pins to this one if only env was used before
    const { data: anyStaff } = await supabase
      .from('users')
      .select('id')
      .eq('role', 'staff')
      .eq('active', true)
      .limit(1);

    if (anyStaff?.length) {
      const { error } = await supabase
        .from('users')
        .update({ pin_hash, display_name: staffName })
        .eq('id', anyStaff[0].id);
      if (error) return { ok: false, error: error.message };
    } else {
      const { error } = await supabase.from('users').insert({
        username: staffUsername,
        pin_hash,
        role: 'staff',
        display_name: staffName,
        active: true,
      });
      if (error) return { ok: false, error: error.message };
    }
  }

  return { ok: true };
}

/**
 * Set admin confirmation PIN (used on POS Invoice refunds). Stored as admin pin_hash.
 * @param {{ adminUsername: string, adminPassword: string, newPin: string }} input
 */
export async function changeAdminPin(input) {
  const adminUsername = String(input?.adminUsername || '').trim().toLowerCase();
  const adminPassword = String(input?.adminPassword || '');
  const newPin = String(input?.newPin || '').replace(/\D/g, '');

  if (newPin.length < 4 || newPin.length > 8) {
    return { ok: false, error: 'Admin PIN must be 4–8 digits' };
  }

  const auth = await authenticateAdmin(adminUsername, adminPassword);
  if (!auth.ok) return { ok: false, error: 'Admin password is incorrect' };

  const supabase = getServiceSupabase();
  if (!supabase) {
    return {
      ok: false,
      error: 'Supabase service role is required to save the admin PIN. Set SUPABASE_SERVICE_ROLE_KEY, then try again.',
    };
  }

  const pin_hash = hashSecret(newPin);
  const { data: existing } = await supabase
    .from('users')
    .select('id, password_hash')
    .ilike('username', adminUsername)
    .eq('role', 'admin')
    .maybeSingle();

  if (existing?.id) {
    const { error } = await supabase
      .from('users')
      .update({ pin_hash, active: true })
      .eq('id', existing.id);
    if (error) return { ok: false, error: error.message };
  } else {
    // Ensure admin row exists with both password (current) and new pin
    const password_hash = hashSecret(adminPassword);
    const { error } = await supabase.from('users').insert({
      username: adminUsername,
      password_hash,
      pin_hash,
      role: 'admin',
      display_name: 'Administrator',
      active: true,
    });
    if (error) return { ok: false, error: error.message };
  }

  return { ok: true };
}

export { hashSecret, verifySecret, getDemoUsers };
