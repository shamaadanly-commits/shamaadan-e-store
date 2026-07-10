/**
 * Runtime environment injection for Supabase credentials.
 * Loaded before the router so both apps share the same config.
 */
export default function handler(_req, res) {
  // Only non-secret hints for offline/static demo fallback.
  // Production auth verifies against hashed credentials server-side.
  const payload = {
    VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || '',
    VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY || '',
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
