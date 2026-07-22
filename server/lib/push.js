/**
 * Web Push helpers for new online-order alerts.
 */
import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';

function getServiceSupabase() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export function getVapidPublicKey() {
  return String(process.env.VAPID_PUBLIC_KEY || '').trim();
}

function getVapidPrivateKey() {
  return String(process.env.VAPID_PRIVATE_KEY || '').trim();
}

function getVapidSubject() {
  return String(process.env.VAPID_SUBJECT || 'mailto:shamaadanly@gmail.com').trim();
}

export function isPushConfigured() {
  return Boolean(getVapidPublicKey() && getVapidPrivateKey());
}

function configureWebPush() {
  if (!isPushConfigured()) return false;
  webpush.setVapidDetails(getVapidSubject(), getVapidPublicKey(), getVapidPrivateKey());
  return true;
}

/**
 * @param {{ endpoint: string, keys: { p256dh: string, auth: string }, userAgent?: string, label?: string }} sub
 */
export async function savePushSubscription(sub) {
  const supabase = getServiceSupabase();
  if (!supabase) throw new Error('Supabase service role not configured');

  const endpoint = String(sub?.endpoint || '').trim();
  const p256dh = String(sub?.keys?.p256dh || '').trim();
  const auth = String(sub?.keys?.auth || '').trim();
  if (!endpoint || !p256dh || !auth) throw new Error('Invalid push subscription');

  const { error } = await supabase.from('push_subscriptions').upsert({
    endpoint,
    p256dh,
    auth,
    user_agent: sub.userAgent ? String(sub.userAgent).slice(0, 400) : null,
    label: String(sub.label || 'admin').slice(0, 80),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'endpoint' });

  if (error) {
    if (/Could not find the table|schema cache|push_subscriptions/i.test(error.message)) {
      throw new Error('Run sql/push_subscriptions.sql in the Supabase SQL Editor.');
    }
    throw new Error(error.message);
  }
}

/**
 * @param {string} endpoint
 */
export async function deletePushSubscription(endpoint) {
  const supabase = getServiceSupabase();
  if (!supabase) return;
  const ep = String(endpoint || '').trim();
  if (!ep) return;
  await supabase.from('push_subscriptions').delete().eq('endpoint', ep);
}

/**
 * @param {{ title: string, body: string, url?: string, tag?: string, data?: object }} payload
 */
export async function sendPushToAll(payload) {
  if (!configureWebPush()) {
    return { sent: 0, skipped: true, reason: 'VAPID keys not configured' };
  }

  const supabase = getServiceSupabase();
  if (!supabase) {
    return { sent: 0, skipped: true, reason: 'Supabase not configured' };
  }

  const { data, error } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .limit(200);

  if (error) {
    console.error('[push] load subscriptions failed:', error.message);
    return { sent: 0, failed: 1, error: error.message };
  }

  const rows = data || [];
  if (!rows.length) return { sent: 0, failed: 0 };

  const body = JSON.stringify({
    title: payload.title || 'Shamaadan',
    body: payload.body || '',
    url: payload.url || '/?app=admin&view=website-orders',
    tag: payload.tag || 'shamaadan-order',
    data: payload.data || {},
  });

  let sent = 0;
  let failed = 0;
  const stale = [];

  await Promise.all(rows.map(async (row) => {
    try {
      await webpush.sendNotification({
        endpoint: row.endpoint,
        keys: { p256dh: row.p256dh, auth: row.auth },
      }, body, { TTL: 60 * 60 });
      sent += 1;
    } catch (err) {
      failed += 1;
      const status = err?.statusCode || err?.status;
      if (status === 404 || status === 410) stale.push(row.endpoint);
      console.warn('[push] send failed:', status || err?.message);
    }
  }));

  if (stale.length) {
    await supabase.from('push_subscriptions').delete().in('endpoint', stale);
  }

  return { sent, failed, removed: stale.length };
}

/**
 * Notify admins about a new online order.
 * @param {{ invoiceNumber?: string, orderId?: string, total?: number, customerName?: string }} order
 */
export async function notifyNewOnlineOrder(order) {
  const invoice = order?.invoiceNumber || order?.orderId || 'new order';
  const total = Number(order?.total);
  const customer = String(order?.customerName || '').trim();
  const totalLabel = Number.isFinite(total) ? ` · ${total.toFixed(2)} LYD` : '';
  const who = customer ? ` from ${customer}` : '';

  try {
    return await sendPushToAll({
      title: 'New online order',
      body: `${invoice}${who}${totalLabel}`,
      url: '/?app=admin&view=website-orders',
      tag: `order-${order?.orderId || invoice}`,
      data: {
        orderId: order?.orderId || null,
        invoiceNumber: order?.invoiceNumber || null,
      },
    });
  } catch (err) {
    console.error('[push] notifyNewOnlineOrder failed:', err?.message || err);
    return { sent: 0, failed: 1, error: err?.message || String(err) };
  }
}
