/**
 * GET /api/auth/session?scope=admin|pos — Validate session cookie.
 */
import { getSessionFromRequest } from '../lib/session.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const scope = url.searchParams.get('scope') === 'pos' ? 'pos' : 'admin';
  const session = getSessionFromRequest(req, scope);

  if (!session) {
    return res.status(401).json({ ok: false, authenticated: false });
  }

  return res.status(200).json({
    ok: true,
    authenticated: true,
    user: {
      id: session.userId,
      username: session.username,
      role: session.role,
      displayName: session.displayName,
    },
    scope: session.scope,
    expiresAt: session.expiresAt,
  });
}
