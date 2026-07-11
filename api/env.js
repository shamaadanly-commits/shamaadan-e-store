/**
 * Runtime environment injection for Supabase credentials.
 * Loaded before the router so both apps share the same config.
 *
 * Accepts common env aliases so Production still works if vars were
 * named SUPABASE_URL / SUPABASE_ANON_KEY instead of the VITE_ prefix.
 */
function pick(...keys) {
  for (const key of keys) {
    const value = process.env[key];
    if (value && String(value).trim()) return String(value).trim();
  }
  return '';
}

export default function handler(_req, res) {
  // Only non-secret hints for offline/static demo fallback.
  // Production auth verifies against hashed credentials server-side.
  const payload = {
    VITE_SUPABASE_URL: pick(
      'VITE_SUPABASE_URL',
      'SUPABASE_URL',
      'NEXT_PUBLIC_SUPABASE_URL',
      'PUBLIC_SUPABASE_URL',
    ),
    VITE_SUPABASE_ANON_KEY: pick(
      'VITE_SUPABASE_ANON_KEY',
      'SUPABASE_ANON_KEY',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'PUBLIC_SUPABASE_ANON_KEY',
      'VITE_SUPABASE_PUBLISHABLE_KEY',
      'SUPABASE_PUBLISHABLE_KEY',
    ),
    AUTH_ADMIN_USERNAME: process.env.AUTH_ADMIN_USERNAME || 'admin',
    // Legacy ADMIN_PIN doubles as demo admin password when AUTH_ADMIN_PASSWORD unset
    ADMIN_PIN: process.env.ADMIN_PIN || '',
    AUTH_STAFF_PIN: process.env.AUTH_STAFF_PIN || '',
    AUTH_STAFF_NAME: process.env.AUTH_STAFF_NAME || '',
  };

  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).send(`window.__ENV__=${JSON.stringify(payload)};`);
}
