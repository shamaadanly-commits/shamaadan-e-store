/**
 * Unified auth router — one serverless function for all auth actions.
 *
 * POST /api/auth?action=login|pin|logout|hash
 * GET  /api/auth?action=session&scope=admin|pos
 *
 * Also accepts action in JSON body for POST requests.
 */
import { authenticateAdmin, authenticatePosPin, authenticateAdminPin, changeAdminPassword, changePosPin, changeAdminPin } from '../server/lib/users.js';
import { hashSecret } from '../server/lib/password.js';
import {
  createSessionToken,
  buildSetCookie,
  buildClearCookie,
  cookieNameForScope,
  getSessionFromRequest,
} from '../server/lib/session.js';

function parseBody(req) {
  if (!req.body) return {};
  return typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
}

function getAction(req, body = {}) {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  return String(url.searchParams.get('action') || body.action || '').trim().toLowerCase();
}

async function handleLogin(req, res, body) {
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
}

async function handlePin(req, res, body) {
  const pin = String(body.pin ?? '').replace(/\D/g, '');
  const result = await authenticatePosPin(pin);
  if (!result.ok) {
    return res.status(401).json({ ok: false, error: result.error });
  }

  const { token, expiresAt } = createSessionToken({
    userId: result.user.id,
    username: result.user.username,
    role: result.user.role,
    displayName: result.user.displayName,
    scope: 'pos',
  });

  res.setHeader('Set-Cookie', buildSetCookie(cookieNameForScope('pos'), token, expiresAt));
  return res.status(200).json({
    ok: true,
    user: result.user,
    expiresAt,
    source: result.source,
  });
}

async function handleVerifyAdminPin(req, res, body) {
  const pin = String(body.pin ?? body.password ?? '');
  const result = await authenticateAdminPin(pin);
  if (!result.ok) {
    return res.status(401).json({ ok: false, error: result.error });
  }
  return res.status(200).json({ ok: true, user: result.user, source: result.source });
}

function requireAdminSession(req, res) {
  const session = getSessionFromRequest(req, 'admin');
  if (!session) {
    res.status(401).json({ ok: false, error: 'Admin sign-in required' });
    return null;
  }
  return session;
}

async function handleChangeAdminPassword(req, res, body) {
  const session = requireAdminSession(req, res);
  if (!session) return undefined;

  const result = await changeAdminPassword({
    username: body.username || session.username,
    currentPassword: body.currentPassword,
    newPassword: body.newPassword,
  });
  if (!result.ok) return res.status(400).json(result);
  return res.status(200).json({ ok: true, message: 'Admin / dashboard password updated.' });
}

async function handleChangePosPin(req, res, body) {
  const session = requireAdminSession(req, res);
  if (!session) return undefined;

  const result = await changePosPin({
    adminUsername: body.adminUsername || session.username,
    adminPassword: body.adminPassword || body.currentPassword,
    newPin: body.newPin,
    staffName: body.staffName,
  });
  if (!result.ok) return res.status(400).json(result);
  return res.status(200).json({ ok: true, message: 'POS unlock PIN updated.' });
}

async function handleChangeAdminPin(req, res, body) {
  const session = requireAdminSession(req, res);
  if (!session) return undefined;

  const result = await changeAdminPin({
    adminUsername: body.adminUsername || session.username,
    adminPassword: body.adminPassword || body.currentPassword,
    newPin: body.newPin,
  });
  if (!result.ok) return res.status(400).json(result);
  return res.status(200).json({ ok: true, message: 'Admin confirmation PIN updated.' });
}

function handleLogout(req, res, body) {
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

function handleSession(req, res) {
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

function handleHash(req, res, body) {
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

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  try {
    const body = req.method === 'GET' ? {} : parseBody(req);
    const action = getAction(req, body);

    if (!action) {
      return res.status(400).json({
        ok: false,
        error: 'Missing action. Use ?action=login|pin|logout|session|hash|verify-admin-pin|change-admin-password|change-pos-pin|change-admin-pin',
      });
    }

    if (action === 'session') {
      if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({ ok: false, error: 'Method not allowed' });
      }
      return handleSession(req, res);
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ ok: false, error: 'Method not allowed' });
    }

    switch (action) {
      case 'login':
        return await handleLogin(req, res, body);
      case 'pin':
        return await handlePin(req, res, body);
      case 'verify-admin-pin':
        return await handleVerifyAdminPin(req, res, body);
      case 'change-admin-password':
        return await handleChangeAdminPassword(req, res, body);
      case 'change-pos-pin':
        return await handleChangePosPin(req, res, body);
      case 'change-admin-pin':
        return await handleChangeAdminPin(req, res, body);
      case 'logout':
        return handleLogout(req, res, body);
      case 'hash':
        return handleHash(req, res, body);
      default:
        return res.status(400).json({
          ok: false,
          error: `Unknown action "${action}". Use login|pin|logout|session|hash|verify-admin-pin|change-admin-password|change-pos-pin|change-admin-pin`,
        });
    }
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message || 'Auth request failed' });
  }
}
