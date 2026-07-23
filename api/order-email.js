/**
 * Send order confirmation email (used by checkout client-side fallback).
 * POST { invoiceNumber, customer, items, subtotal, shipping, total, paymentMethod }
 */
import { sendOrderConfirmationEmail } from '../server/lib/order-email.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const customer = body.customer || {};
    const items = Array.isArray(body.items) ? body.items : [];

    const result = await sendOrderConfirmationEmail({
      to: String(customer.email || body.to || '').trim(),
      invoiceNumber: String(body.invoiceNumber || body.orderRef || '').trim(),
      customerName: String(customer.fullName || customer.name || '').trim(),
      customerPhone: String(customer.phone || '').trim(),
      customerAddress: String(customer.address || '').trim(),
      customerCity: String(customer.city || '').trim(),
      paymentMethod: body.paymentMethod,
      paymentStatus: body.paymentStatus,
      items: items.map((line) => ({
        name: String(line.name || line.product_name || 'Item'),
        qty: Number(line.qty ?? line.quantity ?? 0),
        unitPrice: Number(line.price ?? line.unit_price ?? 0),
      })),
      subtotal: Number(body.subtotal) || 0,
      shipping: Number(body.shipping) || 0,
      total: Number(body.total) || 0,
    });

    if (result.skipped) {
      return res.status(200).json({ ok: true, skipped: true, error: result.error });
    }
    if (!result.ok) {
      return res.status(502).json({ ok: false, error: result.error || 'Email failed' });
    }
    return res.status(200).json({ ok: true, id: result.id });
  } catch (err) {
    console.error('[api/order-email]', err);
    return res.status(500).json({ ok: false, error: err?.message || 'Email failed' });
  }
}
