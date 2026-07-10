/**
 * POST /api/auth/login — Admin username + password authentication.
 */
import { authenticateAdmin } from '../lib/users.js';
import {
  createSessionToken,
  buildSetCookie,
  cookieNameForScope,
} from '../lib/session.js';

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

  try {
    const body = parseBody(req);
    const username = String(body.username ?? '').trim();
    const password = String(body.password ?? '');

    if (!username || !password) {
      return res.status(400).json({ ok: false, error: 'Username and password are required' });
    }

    const result = await authenticateAdmin(username, password);
    if (!result.ok) {
      return res.status(401).json({ ok: false, error: result.error });
    }

    const { token, expiresAt } = createSessionToken({
      userId: result.user.id,
      username: result.user.username,
      role: result.user.role,
      displayName: result.user.displayName,
      scope: 'admin',
    });

    res.setHeader('Set-Cookie', buildSetCookie(cookieNameForScope('admin'), token, expiresAt));
    return res.status(200).json({
      ok: true,
      user: result.user,
      expiresAt,
      source: result.source,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message || 'Login failed' });
  }
}
