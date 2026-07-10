/**
 * POST /api/auth/logout — Clear admin and/or POS session cookies.
 */
import { buildClearCookie, cookieNameForScope } from '../lib/session.js';

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
  const scope = body.scope === 'admin' || body.scope === 'pos' ? body.scope : 'both';

  const cookies = [];
  if (scope === 'admin' || scope === 'both') {
    cookies.push(buildClearCookie(cookieNameForScope('admin')));
  }
  if (scope === 'pos' || scope === 'both') {
    cookies.push(buildClearCookie(cookieNameForScope('pos')));
  }

  res.setHeader('Set-Cookie', cookies);
  return res.status(200).json({ ok: true });
}
