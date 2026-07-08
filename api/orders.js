/**
 * Order API — processes checkout with CAD or UPAY payment methods.
 */
import { createClient } from '@supabase/supabase-js';

function generateOrderRef() {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `SHM-${ts}-${rand}`;
}

async function processUpayPayment(card, amount, orderRef) {
  const merchantId = process.env.UPAY_MERCHANT_ID;
  const apiKey = process.env.UPAY_API_KEY;
  const apiUrl = process.env.UPAY_API_URL || 'https://api.upay.ae/v1/charges';

  if (!merchantId || !apiKey) {
    // Demo mode — simulate successful UPAY when credentials not configured
    return {
      ok: true,
      transactionId: `UPAY-DEMO-${orderRef}`,
      demo: true,
    };
  }

  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'X-Merchant-Id': merchantId,
    },
    body: JSON.stringify({
      amount: Math.round(amount * 100),
      currency: 'USD',
      reference: orderRef,
      card: {
        number: card.number,
        exp_month: card.expiry.split('/')[0]?.trim(),
        exp_year: card.expiry.split('/')[1]?.trim(),
        cvc: card.cvc,
        name: card.name,
      },
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || 'UPAY payment failed');
  }

  return { ok: true, transactionId: data.transaction_id || data.id };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

    const { paymentMethod, customer, items, subtotal, shipping, total, locale, card } = body;

    if (!paymentMethod || !customer || !items?.length) {
      return res.status(400).json({ ok: false, error: 'Invalid order payload' });
    }

    if (!['cad', 'upay'].includes(paymentMethod)) {
      return res.status(400).json({ ok: false, error: 'Invalid payment method' });
    }

    const orderRef = generateOrderRef();
    let paymentStatus = 'pending';
    let transactionId = null;

    if (paymentMethod === 'upay') {
      if (!card?.number || !card?.expiry || !card?.cvc) {
        return res.status(400).json({ ok: false, error: 'Card details required for UPAY' });
      }
      const payment = await processUpayPayment(card, total, orderRef);
      paymentStatus = 'paid';
      transactionId = payment.transactionId;
    } else {
      paymentStatus = 'cod_pending';
    }

    const order = {
      order_ref: orderRef,
      payment_method: paymentMethod,
      payment_status: paymentStatus,
      transaction_id: transactionId,
      customer_name: customer.fullName,
      customer_phone: customer.phone,
      customer_email: customer.email,
      customer_address: customer.address,
      customer_city: customer.city,
      items,
      subtotal,
      shipping,
      total,
      locale: locale || 'en',
      created_at: new Date().toISOString(),
    };

    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (supabaseUrl && serviceKey) {
      const supabase = createClient(supabaseUrl, serviceKey);
      const { error } = await supabase.from('orders').insert(order);
      if (error) console.error('[orders] Supabase insert failed:', error.message);
    }

    return res.status(200).json({
      ok: true,
      orderRef,
      paymentMethod,
      paymentStatus,
      transactionId,
    });
  } catch (error) {
    console.error('[orders] Error:', error);
    return res.status(500).json({
      ok: false,
      error: error.message || 'Order processing failed',
    });
  }
}
