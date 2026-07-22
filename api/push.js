/**
 * Web Push API — subscribe / unsubscribe / public key / notify / test
 *
 * POST /api/push?action=subscribe|unsubscribe|notify-order|test
 * GET  /api/push?action=public-key
 */
import {
  getVapidPublicKey,
  isPushConfigured,
  savePushSubscription,
  deletePushSubscription,
  notifyNewOnlineOrder,
  sendPushToAll,
} from '../server/lib/push.js';
import { createClient } from '@supabase/supabase-js';

function parseBody(req) {
  if (!req.body) return {};
  return typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
}

function getAction(req, body = {}) {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  return String(url.searchParams.get('action') || body.action || '').trim().toLowerCase();
}

function getServiceSupabase() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  try {
    const body = req.method === 'GET' ? {} : parseBody(req);
    const action = getAction(req, body);

    if (action === 'public-key') {
      if (req.method !== 'GET' && req.method !== 'POST') {
        res.setHeader('Allow', 'GET, POST');
        return res.status(405).json({ ok: false, error: 'Method not allowed' });
      }
      return res.status(200).json({
        ok: true,
        configured: isPushConfigured(),
        publicKey: getVapidPublicKey() || null,
      });
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST, GET');
      return res.status(405).json({ ok: false, error: 'Method not allowed' });
    }

    if (action === 'subscribe') {
      await savePushSubscription({
        endpoint: body.endpoint,
        keys: body.keys || {},
        userAgent: req.headers['user-agent'] || '',
        label: body.label || 'admin',
      });
      return res.status(200).json({ ok: true });
    }

    if (action === 'unsubscribe') {
      await deletePushSubscription(body.endpoint);
      return res.status(200).json({ ok: true });
    }

    if (action === 'notify-order') {
      // Used by client-side checkout fallback after createOrder succeeds.
      const orderId = String(body.orderId || '').trim();
      if (!orderId) {
        return res.status(400).json({ ok: false, error: 'orderId required' });
      }

      const supabase = getServiceSupabase();
      if (!supabase) {
        return res.status(200).json({ ok: true, skipped: true, reason: 'no supabase' });
      }

      const { data: order, error } = await supabase
        .from('orders')
        .select('id, invoice_number, total_amount, customer_name, source, created_at')
        .eq('id', orderId)
        .maybeSingle();

      if (error || !order) {
        return res.status(404).json({ ok: false, error: 'Order not found' });
      }
      if (String(order.source).toLowerCase() !== 'online') {
        return res.status(200).json({ ok: true, skipped: true, reason: 'not online' });
      }

      const result = await notifyNewOnlineOrder({
        orderId: order.id,
        invoiceNumber: order.invoice_number,
        total: Number(order.total_amount) || 0,
        customerName: order.customer_name,
      });
      return res.status(200).json({ ok: true, result });
    }

    if (action === 'test') {
      if (!isPushConfigured()) {
        return res.status(400).json({
          ok: false,
          error: 'Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in Vercel env, then enable notifications in Admin.',
        });
      }
      const result = await sendPushToAll({
        title: 'Shamaadan test',
        body: 'Push notifications are working.',
        url: '/?app=admin&view=website-orders',
        tag: 'shamaadan-test',
      });
      return res.status(200).json({ ok: true, result });
    }

    return res.status(400).json({
      ok: false,
      error: 'Unknown action. Use public-key|subscribe|unsubscribe|notify-order|test',
    });
  } catch (err) {
    console.error('[push]', err);
    return res.status(500).json({ ok: false, error: err?.message || 'Push request failed' });
  }
}
