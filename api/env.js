/**
 * Runtime environment injection for Supabase credentials.
 * Loaded before the router so both apps share the same config.
 */
export default function handler(_req, res) {
  const payload = {
    VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || '',
    VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY || '',
    ADMIN_PIN: process.env.ADMIN_PIN || '',
  };

  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).send(`window.__ENV__=${JSON.stringify(payload)};`);
}
