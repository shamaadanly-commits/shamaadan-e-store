/**
 * POST /api/auth/hash — Generate password/PIN hashes for seeding the users table.
 * Protected by AUTH_SESSION_SECRET or ADMIN_PIN (dev utility).
 */
import { hashSecret } from '../lib/password.js';

function parseBody(req) {
  if (!req.body) return {};
  return typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const body = parseBody(req);
  const secret = String(body.secret ?? '');
  const expected = String(process.env.AUTH_SESSION_SECRET || process.env.ADMIN_PIN || 'shamaadan');

  if (!secret || secret !== expected) {
    return res.status(403).json({ ok: false, error: 'Forbidden' });
  }

  const value = String(body.value ?? '');
  if (!value) {
    return res.status(400).json({ ok: false, error: 'value is required' });
  }

  return res.status(200).json({
    ok: true,
    hash: hashSecret(value),
    algorithm: 'scrypt (PASSWORD_DEFAULT equivalent)',
  });
}
