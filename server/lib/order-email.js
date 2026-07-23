/**
 * Order confirmation email via Resend.
 *
 * Env:
 *   RESEND_API_KEY     — required to send
 *   RESEND_FROM_EMAIL  — e.g. "Shamaadan <orders@shamaadan.ly>"
 *                        (domain must be verified in Resend)
 *   ORDER_NOTIFY_EMAIL — optional shop copy (default info@shamaadan.ly)
 */

function pickEnv(...keys) {
  for (const key of keys) {
    const value = process.env[key];
    if (value && String(value).trim()) return String(value).trim();
  }
  return '';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatLyd(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '0.00 LYD';
  return `${n.toFixed(2)} LYD`;
}

function paymentLabel(method) {
  const m = String(method || '').toLowerCase();
  if (m === 'cad') return 'Cash on Delivery (CAD)';
  if (m === 'upay' || m === 'credit') return 'Card / Credit';
  return method || '—';
}

/**
 * @param {{
 *   to: string,
 *   invoiceNumber: string,
 *   customerName?: string,
 *   customerPhone?: string,
 *   customerAddress?: string,
 *   customerCity?: string,
 *   paymentMethod?: string,
 *   paymentStatus?: string,
 *   items?: Array<{ name: string, qty: number, unitPrice: number }>,
 *   subtotal?: number,
 *   shipping?: number,
 *   total?: number,
 * }} order
 */
export function buildOrderEmailHtml(order) {
  const items = Array.isArray(order.items) ? order.items : [];
  const rows = items.map((item) => {
    const lineTotal = Number(item.unitPrice || 0) * Number(item.qty || 0);
    return `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #ece7df;color:#2a241c;">
          ${escapeHtml(item.name || 'Item')}
          <div style="color:#8a8378;font-size:12px;">Qty ${escapeHtml(item.qty)}</div>
        </td>
        <td style="padding:10px 0;border-bottom:1px solid #ece7df;text-align:right;color:#2a241c;white-space:nowrap;">
          ${escapeHtml(formatLyd(lineTotal))}
        </td>
      </tr>`;
  }).join('');

  const address = [order.customerAddress, order.customerCity].filter(Boolean).join(', ');

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f0e8;font-family:Georgia,'Times New Roman',serif;">
  <div style="max-width:560px;margin:0 auto;padding:28px 16px;">
    <div style="background:#181510;color:#e8e3d9;border-radius:16px 16px 0 0;padding:28px 24px;">
      <div style="font-size:13px;letter-spacing:0.14em;text-transform:uppercase;color:#c9a84c;">Shamaadan</div>
      <h1 style="margin:10px 0 0;font-size:28px;font-weight:400;">Order confirmed</h1>
      <p style="margin:10px 0 0;color:#b5aea3;font-size:15px;">Thank you for your order${order.customerName ? `, ${escapeHtml(order.customerName)}` : ''}.</p>
    </div>
    <div style="background:#ffffff;padding:24px;border:1px solid #e8e4de;border-top:0;border-radius:0 0 16px 16px;">
      <p style="margin:0 0 18px;color:#57391d;font-size:14px;">
        <strong>Order</strong> ${escapeHtml(order.invoiceNumber)}
      </p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        ${rows || '<tr><td style="padding:8px 0;color:#8a8378;">No items listed</td></tr>'}
      </table>
      <div style="margin-top:18px;padding-top:14px;border-top:1px solid #ece7df;font-size:14px;color:#2a241c;">
        <div style="display:flex;justify-content:space-between;margin:4px 0;">
          <span style="color:#8a8378;">Subtotal</span>
          <span>${escapeHtml(formatLyd(order.subtotal))}</span>
        </div>
        <div style="display:flex;justify-content:space-between;margin:4px 0;">
          <span style="color:#8a8378;">Shipping</span>
          <span>${escapeHtml(formatLyd(order.shipping))}</span>
        </div>
        <div style="display:flex;justify-content:space-between;margin:10px 0 0;font-size:18px;">
          <strong>Total</strong>
          <strong style="color:#7d651a;">${escapeHtml(formatLyd(order.total))}</strong>
        </div>
      </div>
      <div style="margin-top:22px;padding:14px;background:#f7f3ec;border-radius:12px;font-size:13px;color:#2a241c;line-height:1.55;">
        <div><strong>Payment:</strong> ${escapeHtml(paymentLabel(order.paymentMethod))}</div>
        ${order.customerPhone ? `<div><strong>Phone:</strong> ${escapeHtml(order.customerPhone)}</div>` : ''}
        ${address ? `<div><strong>Delivery:</strong> ${escapeHtml(address)}</div>` : ''}
      </div>
      <p style="margin:22px 0 0;font-size:13px;color:#8a8378;line-height:1.6;">
        Questions? Email <a href="mailto:info@shamaadan.ly" style="color:#7d651a;">info@shamaadan.ly</a>
        or call <a href="tel:+218910229971" style="color:#7d651a;">091-0229971</a>.
      </p>
    </div>
  </div>
</body>
</html>`;
}

/**
 * @param {Parameters<typeof buildOrderEmailHtml>[0]} order
 * @returns {Promise<{ ok: boolean, skipped?: boolean, id?: string, error?: string }>}
 */
export async function sendOrderConfirmationEmail(order) {
  const apiKey = pickEnv('RESEND_API_KEY');
  const to = String(order?.to || '').trim();
  if (!apiKey) {
    return { ok: false, skipped: true, error: 'RESEND_API_KEY not configured' };
  }
  if (!to || !to.includes('@')) {
    return { ok: false, skipped: true, error: 'Customer email missing' };
  }

  const from = pickEnv('RESEND_FROM_EMAIL') || 'Shamaadan <onboarding@resend.dev>';
  const notify = pickEnv('ORDER_NOTIFY_EMAIL', 'SHOP_NOTIFY_EMAIL') || 'info@shamaadan.ly';
  const invoice = String(order.invoiceNumber || 'order').trim();

  const payload = {
    from,
    to: [to],
    subject: `Shamaadan order ${invoice}`,
    html: buildOrderEmailHtml(order),
  };

  if (notify && notify.toLowerCase() !== to.toLowerCase()) {
    payload.bcc = [notify];
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data?.message || data?.error || `Resend HTTP ${res.status}`;
    console.error('[order-email] Resend failed:', message);
    return { ok: false, error: message };
  }

  return { ok: true, id: data?.id };
}
