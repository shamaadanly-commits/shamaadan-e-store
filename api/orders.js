/**
 * Order API — processes website checkout with CAD or UPAY payment methods.
 * Persists to orders + order_items; invoice_number assigned by DB trigger.
 */
import { createClient } from '@supabase/supabase-js';

function pickEnv(...keys) {
  for (const key of keys) {
    const value = process.env[key];
    if (value && String(value).trim()) return String(value).trim();
  }
  return '';
}

function getSupabaseAdmin() {
  const supabaseUrl = pickEnv(
    'VITE_SUPABASE_URL',
    'SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_URL',
    'PUBLIC_SUPABASE_URL',
  );
  // Prefer service role; fall back to anon (RLS on orders allows insert).
  const supabaseKey = pickEnv(
    'SUPABASE_SERVICE_ROLE_KEY',
    'VITE_SUPABASE_ANON_KEY',
    'SUPABASE_ANON_KEY',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'PUBLIC_SUPABASE_ANON_KEY',
    'VITE_SUPABASE_PUBLISHABLE_KEY',
    'SUPABASE_PUBLISHABLE_KEY',
  );

  if (!supabaseUrl || !supabaseKey) return null;
  return createClient(supabaseUrl, supabaseKey);
}

async function processUpayPayment(card, amount, orderRef) {
  const merchantId = process.env.UPAY_MERCHANT_ID;
  const apiKey = process.env.UPAY_API_KEY;
  const apiUrl = process.env.UPAY_API_URL || 'https://api.upay.ae/v1/charges';

  if (!merchantId || !apiKey) {
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

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string[]} productIds
 */
async function loadProductsById(supabase, productIds) {
  const ids = [...new Set(productIds.filter(Boolean))];
  if (!ids.length) return new Map();

  const { data, error } = await supabase
    .from('products')
    .select('id, name, wholesale_cost, retail_price, stock_quantity')
    .in('id', ids);

  if (error) throw new Error(error.message);
  return new Map((data || []).map((p) => [String(p.id), p]));
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

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return res.status(503).json({
        ok: false,
        error: 'Order storage is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (or SUPABASE_SERVICE_ROLE_KEY) in Vercel → Environment Variables, then redeploy.',
        code: 'not_configured',
      });
    }

    const productMap = await loadProductsById(
      supabase,
      items.map((line) => line.productId),
    );

    const lineItems = items.map((line) => {
      const product = productMap.get(String(line.productId));
      if (!product) {
        throw new Error(`Product not found: ${line.name || line.productId}`);
      }
      const qty = Math.trunc(Number(line.qty) || 0);
      if (qty <= 0) throw new Error('Each item needs a positive quantity.');
      const stock = Number(product.stock_quantity ?? 0);
      if (stock < qty) {
        throw new Error(`${product.name || line.name} is out of stock.`);
      }
      return {
        product_id: String(product.id),
        quantity: qty,
        unit_price: Number(line.price ?? product.retail_price ?? 0),
        wholesale_cost: Number(product.wholesale_cost ?? 0),
        product_name: String(line.name || product.name || 'Item'),
      };
    });

    let paymentStatus = paymentMethod === 'upay' ? 'paid' : 'cod_pending';
    let orderStatus = paymentMethod === 'upay' ? 'paid' : 'pending';
    let transactionId = null;

    const now = new Date().toISOString();
    const orderPayload = {
      source: 'online',
      status: orderStatus,
      total_amount: Number(total) || 0,
      subtotal_amount: Number(subtotal) || 0,
      shipping_amount: Number(shipping) || 0,
      customer_name: String(customer.fullName || '').trim(),
      customer_phone: String(customer.phone || '').trim(),
      customer_email: String(customer.email || '').trim(),
      customer_address: String(customer.address || '').trim(),
      customer_city: String(customer.city || '').trim(),
      customer_location: [customer.address, customer.city].filter(Boolean).join(', '),
      payment_method: paymentMethod,
      payment_status: paymentStatus,
      notes: locale ? `Locale: ${locale}` : null,
      updated_at: now,
    };

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert(orderPayload)
      .select('*')
      .single();

    if (orderError) {
      console.error('[orders] insert failed:', orderError.message);
      return res.status(500).json({ ok: false, error: orderError.message });
    }

    const invoiceNumber = order.invoice_number || order.id;

    if (paymentMethod === 'upay') {
      if (!card?.number || !card?.expiry || !card?.cvc) {
        await supabase.from('orders').delete().eq('id', order.id);
        return res.status(400).json({ ok: false, error: 'Card details required for UPAY' });
      }
      try {
        const payment = await processUpayPayment(card, total, invoiceNumber);
        transactionId = payment.transactionId;
        paymentStatus = 'paid';
      } catch (payErr) {
        await supabase.from('orders').delete().eq('id', order.id);
        throw payErr;
      }
    }

    const orderItemRows = lineItems.map((item) => ({
      order_id: order.id,
      product_id: item.product_id,
      quantity: item.quantity,
      unit_price: item.unit_price,
      wholesale_cost: item.wholesale_cost,
      product_name: item.product_name,
    }));

    const { error: itemsError } = await supabase
      .from('order_items')
      .insert(orderItemRows);

    if (itemsError) {
      await supabase.from('orders').delete().eq('id', order.id);
      return res.status(500).json({ ok: false, error: itemsError.message });
    }

    const inventoryRows = lineItems.map((item) => ({
      product_id: item.product_id,
      quantity_changed: -Math.abs(item.quantity),
      type: 'sale',
      source: 'online',
      notes: `Website order ${invoiceNumber}`,
    }));

    const { error: inventoryError } = await supabase
      .from('inventory_transactions')
      .insert(inventoryRows);

    if (inventoryError) {
      console.error('[orders] inventory failed:', inventoryError.message);
      return res.status(500).json({
        ok: false,
        error: `Order ${invoiceNumber} saved but stock could not be updated: ${inventoryError.message}`,
      });
    }

    if (transactionId) {
      await supabase
        .from('orders')
        .update({
          payment_status: paymentStatus,
          notes: `${order.notes || ''} · UPAY ${transactionId}`.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', order.id);
    }

    return res.status(200).json({
      ok: true,
      orderRef: invoiceNumber,
      invoiceNumber,
      orderId: order.id,
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
