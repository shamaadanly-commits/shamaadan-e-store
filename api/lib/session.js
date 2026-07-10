/**
 * Signed session tokens (HMAC-SHA256) + HttpOnly cookie helpers.
 * No external auth libraries.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const COOKIE_ADMIN = 'shamaadan_admin_session';
const COOKIE_POS = 'shamaadan_pos_session';
const ADMIN_TTL_MS = 12 * 60 * 60 * 1000;
const POS_TTL_MS = 16 * 60 * 60 * 1000;

/**
 * @returns {string}
 */
function getSecret() {
  const secret = process.env.AUTH_SESSION_SECRET
    || process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.ADMIN_PIN
    || 'shamaadan-dev-session-secret';
  return String(secret);
}

/**
 * @param {string} value
 * @returns {string}
 */
function sign(value) {
  return createHmac('sha256', getSecret()).update(value).digest('base64url');
}

/**
 * @param {{ userId: string, username: string, role: string, displayName: string, scope: 'admin' | 'pos' }} payload
 * @returns {{ token: string, expiresAt: string }}
 */
export function createSessionToken(payload) {
  const ttl = payload.scope === 'admin' ? ADMIN_TTL_MS : POS_TTL_MS;
  const expiresAt = new Date(Date.now() + ttl).toISOString();
  const body = {
    ...payload,
    sid: randomBytes(16).toString('hex'),
    exp: expiresAt,
  };
  const encoded = Buffer.from(JSON.stringify(body), 'utf8').toString('base64url');
  const token = `${encoded}.${sign(encoded)}`;
  return { token, expiresAt };
}

/**
 * @param {string | undefined} token
 * @param {'admin' | 'pos'} [expectedScope]
 * @returns {null | { userId: string, username: string, role: string, displayName: string, scope: string, expiresAt: string }}
 */
export function verifySessionToken(token, expectedScope) {
  if (!token || typeof token !== 'string') return null;
  const [encoded, sig] = token.split('.');
  if (!encoded || !sig) return null;

  const expectedSig = sign(encoded);
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const body = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (!body?.userId || !body?.exp || !body?.scope) return null;
    if (expectedScope && body.scope !== expectedScope) return null;
    if (Date.parse(body.exp) <= Date.now()) return null;
    return {
      userId: String(body.userId),
      username: String(body.username || ''),
      role: String(body.role || ''),
      displayName: String(body.displayName || body.username || ''),
      scope: String(body.scope),
      expiresAt: String(body.exp),
    };
  } catch {
    return null;
  }
}

/**
 * @param {import('http').IncomingMessage} req
 * @param {string} name
 * @returns {string | undefined}
 */
export function readCookie(req, name) {
  const header = req.headers?.cookie;
  if (!header) return undefined;
  const parts = String(header).split(';');
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    if (key === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return undefined;
}

/**
 * @param {'admin' | 'pos'} scope
 */
export function cookieNameForScope(scope) {
  return scope === 'admin' ? COOKIE_ADMIN : COOKIE_POS;
}

/**
 * @param {string} name
 * @param {string} value
 * @param {string} expiresAt
 * @returns {string}
 */
export function buildSetCookie(name, value, expiresAt) {
  const maxAge = Math.max(0, Math.floor((Date.parse(expiresAt) - Date.now()) / 1000));
  const secure = process.env.VERCEL || process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}; Expires=${new Date(expiresAt).toUTCString()}${secure}`;
}

/**
 * @param {string} name
 * @returns {string}
 */
export function buildClearCookie(name) {
  const secure = process.env.VERCEL || process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secure}`;
}

/**
 * @param {import('http').IncomingMessage} req
 * @param {'admin' | 'pos'} scope
 */
export function getSessionFromRequest(req, scope) {
  const token = readCookie(req, cookieNameForScope(scope));
  return verifySessionToken(token, scope);
}

export { COOKIE_ADMIN, COOKIE_POS };
