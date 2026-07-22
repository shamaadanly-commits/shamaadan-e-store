/**
 * Shared Supabase client — Dashboard + POS backend.
 * Schema: products, orders, order_items, inventory_transactions
 * Stock is adjusted by a DB trigger on inventory_transactions inserts.
 *
 * Credentials come from window.__ENV__ (via /api/env.js) in the browser.
 * Never uses a placeholder host — missing keys throw a clear config error
 * instead of an opaque "Failed to fetch".
 */
import { createClient } from '@supabase/supabase-js';
import { isLiveDbId } from './ids.js';

const URL_KEYS = [
  'VITE_SUPABASE_URL',
  'SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'PUBLIC_SUPABASE_URL',
];

const ANON_KEYS = [
  'VITE_SUPABASE_ANON_KEY',
  'SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'PUBLIC_SUPABASE_ANON_KEY',
  'VITE_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_PUBLISHABLE_KEY',
];

/** @type {import('@supabase/supabase-js').SupabaseClient | null} */
let _client = null;

function readEnv(key) {
  try {
    const meta = import.meta?.env?.[key];
    if (meta) return String(meta).trim();
  } catch {
    // ignore — not a Vite runtime
  }

  if (typeof process !== 'undefined' && process.env?.[key]) {
    return String(process.env[key]).trim();
  }

  if (typeof globalThis !== 'undefined' && globalThis.__ENV__?.[key]) {
    return String(globalThis.__ENV__[key]).trim();
  }

  return '';
}

function firstEnv(keys) {
  for (const key of keys) {
    const value = readEnv(key);
    if (value) return value;
  }
  return '';
}

/**
 * @returns {{ url: string, anonKey: string }}
 */
export function resolveSupabaseCredentials() {
  return {
    url: firstEnv(URL_KEYS),
    anonKey: firstEnv(ANON_KEYS),
  };
}

export function isSupabaseConfigured() {
  const { url, anonKey } = resolveSupabaseCredentials();
  return Boolean(url && anonKey);
}

/**
 * @param {unknown} err
 * @param {string} action
 */
export function mapSupabaseNetworkError(err, action = 'talking to Supabase') {
  const raw = err instanceof Error ? err.message : String(err ?? 'Unknown error');
  if (/failed to fetch|networkerror|load failed|fetch failed|network request failed/i.test(raw)) {
    return new Error(
      `Could not reach Supabase while ${action}. `
        + 'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Vercel → Project Settings → Environment Variables, then redeploy.',
    );
  }
  return err instanceof Error ? err : new Error(raw);
}

function assertConfigured() {
  if (!isSupabaseConfigured()) {
    throw new Error(
      'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY '
        + 'in Vercel → Project Settings → Environment Variables (Production), then redeploy.',
    );
  }
}

/**
 * Lazy singleton — reads window.__ENV__ at first use (after /api/env.js).
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
export function getSupabase() {
  if (_client) return _client;

  assertConfigured();
  const { url, anonKey } = resolveSupabaseCredentials();

  _client = createClient(url, anonKey, {
    auth: {
      persistSession: typeof window !== 'undefined',
      autoRefreshToken: typeof window !== 'undefined',
      detectSessionInUrl: typeof window !== 'undefined',
    },
  });

  return _client;
}

/**
 * Upload a product image to Supabase Storage (public URL).
 * Used when Cloudflare R2 is not configured.
 * @param {{ dataUrl: string, filename?: string, contentType?: string }} input
 * @returns {Promise<string>} public URL
 */
export async function uploadProductImage(input) {
  const dataUrl = String(input?.dataUrl || '');
  if (!dataUrl.startsWith('data:')) {
    throw new Error('Expected a data URL for image upload.');
  }

  const match = /^data:([^;,]+)?(;base64)?,([\s\S]+)$/i.exec(dataUrl);
  if (!match) throw new Error('Invalid image data URL.');

  const contentType = String(input?.contentType || match[1] || 'image/jpeg').split(';')[0].trim() || 'image/jpeg';
  const isBase64 = Boolean(match[2] && match[2].includes('base64'));
  const raw = match[3];

  let bytes;
  if (isBase64) {
    const binary = atob(raw);
    bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  } else {
    bytes = new TextEncoder().encode(decodeURIComponent(raw));
  }

  const ext = contentType.includes('png')
    ? 'png'
    : contentType.includes('webp')
      ? 'webp'
      : contentType.includes('gif')
        ? 'gif'
        : 'jpg';

  const safeName = String(input?.filename || `product.${ext}`)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60) || `product.${ext}`;

  const path = `products/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;
  const client = getSupabase();
  const bucket = 'product-images';

  const { error } = await client.storage
    .from(bucket)
    .upload(path, bytes, {
      contentType,
      upsert: false,
      cacheControl: '31536000',
    });

  if (error) {
    console.error('[shared/supabase] storage upload failed:', error);
    throw new Error(
      error.message.includes('Bucket not found') || error.message.includes('not found')
        ? 'Image storage bucket is missing. Run sql/product_images_storage.sql in the Supabase SQL Editor, then try again.'
        : `Image upload failed: ${error.message}`,
    );
  }

  const { data } = client.storage.from(bucket).getPublicUrl(path);
  if (!data?.publicUrl) throw new Error('Upload succeeded but no public URL was returned.');
  return data.publicUrl;
}

/**
 * Back-compat proxy so existing `supabase.from(...)` call sites stay valid
 * while still initializing lazily after /api/env.js injects credentials.
 */
export const supabase = new Proxy(
  /** @type {import('@supabase/supabase-js').SupabaseClient} */ ({}),
  {
    get(_target, prop, receiver) {
      const client = getSupabase();
      const value = Reflect.get(client, prop, receiver);
      return typeof value === 'function' ? value.bind(client) : value;
    },
  },
);

/**
 * Fetch all products (active first).
 * @returns {Promise<object[]>}
 */
export async function getProducts() {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .order('name', { ascending: true });

  if (error) {
    console.error('[shared/supabase] getProducts failed:', error);
    throw new Error(error.message);
  }
  return data ?? [];
}

/**
 * Map a DB product row into the dashboard / storefront shape.
 * @param {object} row
 */
export function mapProductFromDb(row) {
  const imageUrl = row.image_url || null;
  const imageUrls = Array.isArray(row.image_urls)
    ? row.image_urls.filter(Boolean)
    : imageUrl
      ? [imageUrl]
      : [];

  return {
    id: String(row.id),
    barcode: String(row.barcode ?? row.sku ?? ''),
    sku: String(row.sku ?? row.barcode ?? ''),
    name: String(row.name ?? row.title ?? 'Untitled'),
    title: String(row.name ?? row.title ?? 'Untitled'),
    description: row.description ? String(row.description) : '',
    category: String(row.category ?? 'General'),
    collectionName: String(row.collection ?? row.collection_name ?? row.category ?? 'General'),
    price: Number(row.retail_price ?? row.price ?? 0),
    retailPrice: Number(row.retail_price ?? row.price ?? 0),
    cost: Number(row.wholesale_cost ?? row.cost ?? 0),
    costPrice: Number(row.wholesale_cost ?? row.cost ?? 0),
    stock: Number(row.stock_quantity ?? row.stock ?? 0),
    stockQuantity: Number(row.stock_quantity ?? row.stock ?? 0),
    minStockAlert: Number(row.min_stock_alert ?? 5),
    min_stock_alert: Number(row.min_stock_alert ?? 5),
    image: imageUrls[0] ?? null,
    imageUrls,
    active: row.is_active !== false,
    is_active: row.is_active !== false,
    showOnWebsite: row.show_on_website !== false,
    show_on_website: row.show_on_website !== false,
    category_id: row.category_id ?? null,
    collection_id: row.collection_id ?? null,
  };
}

/**
 * Find or create a category by name.
 * @param {string} name
 */
export async function ensureNamedCategory(name) {
  const trimmed = String(name || 'General').trim() || 'General';
  const { data: existing, error: findError } = await supabase
    .from('categories')
    .select('*')
    .ilike('name', trimmed)
    .maybeSingle();

  if (findError) {
    console.error('[shared/supabase] ensureNamedCategory find failed:', findError);
    throw new Error(findError.message);
  }
  if (existing) return existing;

  const { data, error } = await supabase
    .from('categories')
    .insert({ name: trimmed })
    .select('*')
    .single();

  if (error) {
    console.error('[shared/supabase] ensureNamedCategory insert failed:', error);
    throw new Error(error.message);
  }
  return data;
}

/**
 * Find or create a collection by name.
 * @param {string} name
 */
export async function ensureNamedCollection(name) {
  const trimmed = String(name || 'General').trim() || 'General';
  const { data: existing, error: findError } = await supabase
    .from('collections')
    .select('*')
    .ilike('name', trimmed)
    .maybeSingle();

  if (findError) {
    console.error('[shared/supabase] ensureNamedCollection find failed:', findError);
    throw new Error(findError.message);
  }
  if (existing) return existing;

  const { data, error } = await supabase
    .from('collections')
    .insert({ name: trimmed })
    .select('*')
    .single();

  if (error) {
    console.error('[shared/supabase] ensureNamedCollection insert failed:', error);
    throw new Error(error.message);
  }
  return data;
}

/**
 * @param {{ id?: string, name: string, description?: string }} input
 * @param {string} [renameFrom]
 */
export async function upsertCategoryRow(input, renameFrom = '') {
  const name = String(input?.name || '').trim();
  if (!name) throw new Error('Category name is required');

  const payload = {
    name,
    description: input.description ? String(input.description) : null,
  };

  if (input.id && isLiveDbId(input.id)) {
    const { data: previous } = await supabase
      .from('categories')
      .select('name')
      .eq('id', input.id)
      .maybeSingle();

    const { data, error } = await supabase
      .from('categories')
      .update(payload)
      .eq('id', input.id)
      .select('*')
      .single();
    if (error) throw new Error(error.message);

    const oldName = renameFrom || previous?.name;
    if (oldName && oldName !== name) {
      await supabase.from('products').update({ category: name }).eq('category', oldName);
    }
    return data;
  }

  const { data, error } = await supabase
    .from('categories')
    .insert(payload)
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data;
}

/**
 * @param {{ id?: string, name: string, description?: string }} input
 * @param {string} [renameFrom]
 */
export async function upsertCollectionRow(input, renameFrom = '') {
  const name = String(input?.name || '').trim();
  if (!name) throw new Error('Collection name is required');

  const payload = {
    name,
    description: input.description ? String(input.description) : null,
  };

  if (input.id && isLiveDbId(input.id)) {
    const { data: previous } = await supabase
      .from('collections')
      .select('name')
      .eq('id', input.id)
      .maybeSingle();

    const { data, error } = await supabase
      .from('collections')
      .update(payload)
      .eq('id', input.id)
      .select('*')
      .single();
    if (error) throw new Error(error.message);

    const oldName = renameFrom || previous?.name;
    if (oldName && oldName !== name) {
      // Text-column fallbacks used by some product schemas
      await supabase.from('products').update({ collection: name }).eq('collection', oldName);
      await supabase.from('products').update({ collection_name: name }).eq('collection_name', oldName);
      await supabase.from('products').update({ category: name }).eq('category', oldName);
    }
    return data;
  }

  const { data, error } = await supabase
    .from('collections')
    .insert(payload)
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data;
}

/**
 * Persist a product to Supabase (insert or update).
 * @param {object} product — dashboard product shape
 */
export async function upsertProductRow(product) {
  const name = String(product.title || product.name || '').trim();
  if (!name) throw new Error('Product title is required');

  let categoryId = isLiveDbId(product.category_id) ? String(product.category_id).trim() : null;
  let collectionId = isLiveDbId(product.collection_id) ? String(product.collection_id).trim() : null;
  let collectionName = String(product.collectionName || product.category || '').trim();
  let categoryName = String(product.category || product.collectionName || '').trim();

  // Prefer explicit UUIDs from the admin selects; resolve names from those rows.
  if (collectionId || categoryId) {
    try {
      if (collectionId) {
        const { data: col } = await supabase
          .from('collections')
          .select('id, name')
          .eq('id', collectionId)
          .maybeSingle();
        if (col?.name) collectionName = String(col.name);
      }
      if (categoryId) {
        const { data: cat } = await supabase
          .from('categories')
          .select('id, name')
          .eq('id', categoryId)
          .maybeSingle();
        if (cat?.name) categoryName = String(cat.name);
      }
    } catch (err) {
      console.warn('[shared/supabase] taxonomy lookup by id skipped:', err.message);
    }
  } else if (collectionName || categoryName) {
    // Legacy name-only path (POS / older callers that pass names without UUIDs)
    collectionName = collectionName || categoryName;
    categoryName = categoryName || collectionName;
    try {
      const [cat, col] = await Promise.all([
        ensureNamedCategory(categoryName),
        ensureNamedCollection(collectionName),
      ]);
      categoryId = cat.id;
      collectionId = col.id;
    } catch (err) {
      console.warn('[shared/supabase] taxonomy ensure skipped:', err.message);
    }
  }
  // else: collection/category intentionally optional — leave null

  collectionName = collectionName || null;
  categoryName = categoryName || null;

  const row = {
    barcode: String(product.barcode || product.sku || ''),
    name,
    description: product.description ? String(product.description) : null,
    image_url: (() => {
      const urls = Array.isArray(product.imageUrls)
        ? product.imageUrls.filter(Boolean)
        : product.image
          ? [product.image]
          : [];
      const first = urls[0] || product.image || null;
      if (typeof first === 'string' && first.startsWith('data:')) {
        throw new Error(
          'Product image is still a temporary local preview and was not uploaded. '
            + 'Wait for the upload to finish, or run sql/product_images_storage.sql in Supabase, then re-upload the image.',
        );
      }
      return first;
    })(),
    wholesale_cost: Number(product.costPrice ?? product.cost ?? 0),
    retail_price: Number(product.retailPrice ?? product.price ?? 0),
    stock_quantity: Number(product.stockQuantity ?? product.stock ?? 0),
    min_stock_alert: Number(product.minStockAlert ?? product.min_stock_alert ?? 5),
    is_active: product.active !== false && product.is_active !== false,
    updated_at: new Date().toISOString(),
  };

  // Optional FK / text columns — ignore failures if columns are absent
  const optional = {
    category_id: categoryId,
    collection_id: collectionId,
    category: categoryName,
    collection: collectionName,
    collection_name: collectionName,
    show_on_website: product.showOnWebsite === true || product.show_on_website === true,
  };

  const id = isLiveDbId(product.id) ? String(product.id).trim() : '';

  if (id) {
    let updated = null;
    const primary = await supabase
      .from('products')
      .update({ ...row, ...optional })
      .eq('id', id)
      .select('*')
      .maybeSingle();

    if (primary.error) {
      // Retry without optional columns if schema differs
      console.warn('[shared/supabase] product update with taxonomy failed, retrying core fields:', primary.error.message);
      const retry = await supabase
        .from('products')
        .update(row)
        .eq('id', id)
        .select('*')
        .maybeSingle();
      if (retry.error) {
        console.error('[shared/supabase] upsertProductRow update failed:', retry.error);
        throw new Error(retry.error.message);
      }
      updated = retry.data;
    } else {
      updated = primary.data;
    }

    // maybeSingle() returns null when the UPDATE matched 0 rows — almost always
    // a row-level security policy blocking UPDATE on public.products.
    if (!updated) {
      throw new Error(
        'Could not save product changes: the row was not updated. This is usually a '
          + 'row-level security (RLS) policy that allows INSERT but not UPDATE on '
          + 'public.products. Run sql/catalog_rls.sql in the Supabase SQL Editor, then try again.',
      );
    }
    return updated;
  }

  const { data, error } = await supabase
    .from('products')
    .insert({ ...row, ...optional })
    .select('*')
    .single();

  if (error) {
    console.warn('[shared/supabase] product insert with taxonomy failed, retrying core fields:', error.message);
    const { data: retry, error: retryError } = await supabase
      .from('products')
      .insert(row)
      .select('*')
      .single();
    if (retryError) {
      console.error('[shared/supabase] upsertProductRow insert failed:', retryError);
      throw new Error(retryError.message);
    }
    return retry;
  }
  return data;
}

/**
 * Permanently delete a product from Supabase.
 * @param {string} productId
 */
export async function deleteProductRow(productId) {
  const id = isLiveDbId(productId) ? String(productId).trim() : '';
  if (!id) throw new Error('Product id must be a live Supabase UUID.');

  try {
    const { error } = await getSupabase()
      .from('products')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[shared/supabase] deleteProductRow failed:', error);
      throw new Error(error.message);
    }
    return { ok: true, id };
  } catch (err) {
    throw mapSupabaseNetworkError(err, 'deleting product');
  }
}

/**
 * Fetch a single active product by barcode.
 * @param {string} barcode
 * @returns {Promise<object | null>}
 */
export async function getProductByBarcode(barcode) {
  const code = String(barcode || '').trim();
  if (!code) return null;

  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('barcode', code)
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    console.error('Error fetching product by barcode:', error.message);
    return null;
  }

  return data;
}

/**
 * Update wholesale_cost and retail_price for a product.
 * @param {string} id
 * @param {number} cost
 * @param {number} price
 * @returns {Promise<object>}
 */
export async function updateProductPricing(id, cost, price) {
  const productId = String(id || '').trim();
  if (!productId) throw new Error('Product id is required');

  const wholesale_cost = Number(cost);
  const retail_price = Number(price);

  if (!Number.isFinite(wholesale_cost) || wholesale_cost < 0) {
    throw new Error('Invalid wholesale cost');
  }
  if (!Number.isFinite(retail_price) || retail_price < 0) {
    throw new Error('Invalid retail price');
  }

  const { data, error } = await supabase
    .from('products')
    .update({
      wholesale_cost,
      retail_price,
      updated_at: new Date().toISOString(),
    })
    .eq('id', productId)
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/**
 * Log an inventory movement. DB trigger updates products.stock_quantity.
 * @param {{
 *   product_id: string,
 *   quantity_changed: number,
 *   type?: string,
 *   source?: string,
 *   notes?: string,
 * }} tx
 * @returns {Promise<object>}
 */
export async function logInventoryTransaction(tx) {
  const row = {
    product_id: tx.product_id,
    quantity_changed: Number(tx.quantity_changed),
    type: tx.type || 'adjustment',
    source: tx.source || 'system',
    notes: tx.notes || null,
  };

  if (!row.product_id) throw new Error('product_id is required');
  if (!Number.isFinite(row.quantity_changed) || row.quantity_changed === 0) {
    throw new Error('quantity_changed must be a non-zero number');
  }

  const { data, error } = await supabase
    .from('inventory_transactions')
    .insert(row)
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/**
 * Create a sale: orders → order_items → inventory_transactions (stock via trigger).
 * Pass status: 'open' | 'parked' to park a ticket (still reserves stock).
 * @param {{
 *   source?: string,
 *   status?: string,
 *   total_amount?: number,
 *   notes?: string,
 *   staff_user_id?: string,
 *   staff_name?: string,
 *   ticket_label?: string,
 *   customer_name?: string,
 *   customer_phone?: string,
 *   customer_location?: string,
 *   downpayment?: number,
 * }} orderData
 * @param {Array<{ product_id: string, quantity: number, unit_price: number, wholesale_cost?: number, product_name?: string }>} itemsArray
 * @returns {Promise<{ order: object, items: object[], inventory: object[] }>}
 */
export async function createOrder(orderData, itemsArray) {
  const items = Array.isArray(itemsArray) ? itemsArray : [];
  if (!items.length) throw new Error('itemsArray is required');

  for (const item of items) {
    if (!item.product_id) throw new Error('Each item needs product_id');
    if (!Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0) {
      throw new Error('Each item needs a positive quantity');
    }
  }

  const status = String(orderData?.status || 'completed').trim() || 'completed';
  const isParked = status === 'open' || status === 'parked';
  const reservesOrSells = isParked || ['completed', 'pending', 'paid'].includes(status);

  const total_amount = Number.isFinite(Number(orderData?.total_amount))
    ? Number(orderData.total_amount)
    : items.reduce(
      (sum, item) => sum + Number(item.unit_price) * Number(item.quantity),
      0,
    );

  const subtotal_amount = Number.isFinite(Number(orderData?.subtotal_amount))
    ? Number(orderData.subtotal_amount)
    : total_amount;

  const customerName = String(orderData?.customer_name || '').trim() || null;
  const downpayment = Math.max(0, Number(orderData?.downpayment) || 0);

  const now = new Date().toISOString();
  const orderPayload = {
    source: orderData?.source || 'pos',
    status,
    total_amount,
    subtotal_amount,
    shipping_amount: Math.max(0, Number(orderData?.shipping_amount) || 0),
    notes: orderData?.notes || null,
    staff_user_id: orderData?.staff_user_id || null,
    staff_name: orderData?.staff_name || null,
    ticket_label: orderData?.ticket_label || customerName || null,
    customer_name: customerName,
    customer_phone: String(orderData?.customer_phone || '').trim() || null,
    customer_email: String(orderData?.customer_email || '').trim() || null,
    customer_address: String(orderData?.customer_address || '').trim() || null,
    customer_city: String(orderData?.customer_city || '').trim() || null,
    customer_location: String(orderData?.customer_location || orderData?.customer_address || '').trim() || null,
    downpayment,
    payment_method: orderData?.payment_method ? String(orderData.payment_method) : null,
    payment_status: orderData?.payment_status ? String(orderData.payment_status) : null,
    payment_reference: orderData?.payment_reference ? String(orderData.payment_reference).trim() : null,
    payment_date: orderData?.payment_date ? String(orderData.payment_date).slice(0, 10) : null,
    discount_amount: Math.max(0, Number(orderData?.discount_amount) || 0),
    updated_at: now,
  };

  if (isParked) orderPayload.parked_at = now;
  if (status === 'completed') orderPayload.completed_at = now;

  // 1) Insert order
  const { data: order, error: orderError } = await getSupabase()
    .from('orders')
    .insert(orderPayload)
    .select('*')
    .single();

  if (orderError) {
    if (/payment_reference|payment_date|discount_amount|column/i.test(orderError.message)) {
      throw new Error(
        'Order columns missing. Run sql/pos_payments_refunds.sql in the Supabase SQL Editor.',
      );
    }
    throw new Error(`Order failed: ${orderError.message}`);
  }

  // 2) Insert line items
  const orderItemRows = items.map((item) => ({
    order_id: order.id,
    product_id: item.product_id,
    quantity: Number(item.quantity),
    unit_price: Number(item.unit_price),
    wholesale_cost: Number(item.wholesale_cost ?? 0),
    product_name: item.product_name || null,
  }));

  const { data: insertedItems, error: itemsError } = await getSupabase()
    .from('order_items')
    .insert(orderItemRows)
    .select('*');

  if (itemsError) {
    await getSupabase().from('orders').delete().eq('id', order.id);
    throw new Error(`Order items failed: ${itemsError.message}`);
  }

  // 3) Inventory: parked tickets reserve stock; completed / web orders deduct stock
  const inventoryRows = reservesOrSells
    ? items.map((item) => ({
      product_id: item.product_id,
      quantity_changed: -Math.abs(Number(item.quantity)),
      type: isParked ? 'park' : 'sale',
      source: orderData?.source || 'pos',
      notes: isParked
        ? `Parked ticket ${order.id}`
        : `Order ${order.invoice_number || order.id}`,
    }))
    : [];

  let inventory = [];
  if (inventoryRows.length) {
    const { data: inventoryData, error: inventoryError } = await getSupabase()
      .from('inventory_transactions')
      .insert(inventoryRows)
      .select('*');

    if (inventoryError) {
      throw new Error(
        `Order saved but inventory log failed: ${inventoryError.message}. Check stock manually for order ${order.invoice_number || order.id}.`,
      );
    }
    inventory = inventoryData ?? [];
  }

  return {
    order,
    items: insertedItems ?? [],
    inventory,
  };
}

/**
 * Park the current POS ticket as an open order (reserves / deducts stock).
 * @param {{
 *   staff_user_id?: string,
 *   staff_name?: string,
 *   ticket_label?: string,
 *   notes?: string,
 *   total_amount?: number,
 *   customer_name?: string,
 *   customer_phone?: string,
 *   customer_location?: string,
 *   downpayment?: number,
 * }} meta
 * @param {Array<{ product_id: string, quantity: number, unit_price: number, wholesale_cost?: number, product_name?: string }>} items
 */
export async function saveOpenTicket(meta, items) {
  return createOrder({
    source: 'pos',
    status: 'parked',
    staff_user_id: meta?.staff_user_id,
    staff_name: meta?.staff_name,
    ticket_label: meta?.ticket_label || meta?.customer_name,
    notes: meta?.notes,
    total_amount: meta?.total_amount,
    subtotal_amount: meta?.subtotal_amount,
    discount_amount: meta?.discount_amount,
    customer_name: meta?.customer_name,
    customer_phone: meta?.customer_phone,
    customer_location: meta?.customer_location,
    downpayment: meta?.downpayment,
  }, items);
}

/**
 * List open / parked POS tickets with line items.
 * @returns {Promise<object[]>}
 */
export async function getOpenTickets() {
  const { data, error } = await getSupabase()
    .from('orders')
    .select('*, order_items(*)')
    .eq('source', 'pos')
    .in('status', ['open', 'parked'])
    .order('parked_at', { ascending: false });

  if (error) {
    if (/Could not find the table|schema cache|column/i.test(error.message)) {
      throw new Error(
        'Open tickets need sql/open_tickets.sql run in the Supabase SQL Editor.',
      );
    }
    throw mapSupabaseNetworkError(error, 'loading open tickets');
  }
  return data ?? [];
}

/**
 * Load one open ticket (for resume on POS).
 * @param {string} orderId
 */
export async function getOpenTicket(orderId) {
  const id = String(orderId || '').trim();
  if (!id) throw new Error('Order id is required');

  const { data, error } = await getSupabase()
    .from('orders')
    .select('*, order_items(*)')
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error('Ticket not found.');
  return data;
}

/**
 * Charge a parked ticket: mark completed.
 * Stock was already reserved when the ticket was parked — do not deduct again.
 * @param {string} orderId
 * @param {{ payment_method?: string, payment_reference?: string, payment_date?: string, payment_status?: string }} [payment]
 */
export async function completeOpenTicket(orderId, payment = {}) {
  const ticket = await getOpenTicket(orderId);
  if (ticket.status !== 'open' && ticket.status !== 'parked') {
    throw new Error('This ticket is not open.');
  }

  const items = ticket.order_items || [];
  if (!items.length) throw new Error('Open ticket has no line items.');

  const now = new Date().toISOString();
  const update = {
    status: 'completed',
    completed_at: now,
    updated_at: now,
  };

  if (payment?.payment_method) {
    update.payment_method = String(payment.payment_method);
    update.payment_status = payment.payment_status ? String(payment.payment_status) : 'paid';
  }
  if (payment?.payment_reference) {
    update.payment_reference = String(payment.payment_reference).trim();
  }
  if (payment?.payment_date) {
    update.payment_date = String(payment.payment_date).slice(0, 10);
  }

  const { data: order, error: updateError } = await getSupabase()
    .from('orders')
    .update(update)
    .eq('id', ticket.id)
    .select('*')
    .single();

  if (updateError) {
    if (/payment_reference|payment_date|column/i.test(updateError.message)) {
      throw new Error(
        'Payment columns missing. Run sql/pos_payments_refunds.sql in the Supabase SQL Editor.',
      );
    }
    throw new Error(updateError.message);
  }

  return { order, items, inventory: [] };
}

/**
 * Cancel / void an open ticket and restore reserved inventory.
 * @param {string} orderId
 */
export async function cancelOpenTicket(orderId) {
  const ticket = await getOpenTicket(orderId);
  if (ticket.status !== 'open' && ticket.status !== 'parked') {
    throw new Error('This ticket is not open.');
  }

  const items = (ticket.order_items || []).filter((item) => item.product_id && Number(item.quantity) > 0);

  if (items.length) {
    const restoreRows = items.map((item) => ({
      product_id: item.product_id,
      quantity_changed: Math.abs(Number(item.quantity)),
      type: 'park_void',
      source: 'pos',
      notes: `Voided parked ticket ${ticket.id}`,
    }));

    const { error: inventoryError } = await getSupabase()
      .from('inventory_transactions')
      .insert(restoreRows);

    if (inventoryError) {
      throw new Error(`Could not restore stock: ${inventoryError.message}`);
    }
  }

  const now = new Date().toISOString();
  const { data, error } = await getSupabase()
    .from('orders')
    .update({
      status: 'cancelled',
      updated_at: now,
    })
    .eq('id', ticket.id)
    .in('status', ['open', 'parked'])
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/**
 * Recent completed POS sales (for invoices / refunds).
 * @param {number} [limit]
 * @returns {Promise<object[]>}
 */
export async function getRecentPosSales(limit = 25) {
  const { data, error } = await getSupabase()
    .from('orders')
    .select('*, order_items(*)')
    .eq('source', 'pos')
    .in('status', ['completed', 'refunded'])
    .order('completed_at', { ascending: false })
    .limit(Math.max(1, Math.min(limit, 100)));

  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * POS completed/refunded sales filtered by local date range (YYYY-MM-DD).
 * @param {{ from?: string, to?: string, limit?: number }} [opts]
 * @returns {Promise<object[]>}
 */
export async function getPosSalesByDate(opts = {}) {
  const limit = Math.max(1, Math.min(Number(opts.limit) || 100, 300));
  let query = getSupabase()
    .from('orders')
    .select('*, order_items(*)')
    .eq('source', 'pos')
    .in('status', ['completed', 'refunded'])
    .order('completed_at', { ascending: false })
    .limit(limit);

  const from = String(opts.from || '').trim();
  const to = String(opts.to || '').trim();
  if (from) {
    query = query.gte('created_at', `${from}T00:00:00.000Z`);
  }
  if (to) {
    const toDate = new Date(`${to}T00:00:00.000Z`);
    toDate.setUTCDate(toDate.getUTCDate() + 1);
    query = query.lt('created_at', toDate.toISOString());
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * Cash vs bank transfer totals for completed POS sales (net of line refunds via total_amount).
 * @returns {Promise<{ cash: number, bankTransfer: number, unknown: number, count: number }>}
 */
export async function getPosPaymentBreakdown() {
  const { data, error } = await getSupabase()
    .from('orders')
    .select('payment_method, total_amount, status')
    .eq('source', 'pos')
    .eq('status', 'completed')
    .limit(5000);

  if (error) {
    if (/Could not find the table|schema cache/i.test(error.message)) {
      return { cash: 0, bankTransfer: 0, unknown: 0, count: 0 };
    }
    throw mapSupabaseNetworkError(error, 'loading payment breakdown');
  }

  const totals = { cash: 0, bankTransfer: 0, unknown: 0, count: 0 };
  for (const row of data || []) {
    const amount = Number(row.total_amount) || 0;
    totals.count += 1;
    const method = String(row.payment_method || '').toLowerCase();
    if (method === 'cash') totals.cash += amount;
    else if (method === 'bank_transfer' || method === 'bank-transfer' || method === 'transfer') {
      totals.bankTransfer += amount;
    } else {
      totals.unknown += amount;
    }
  }
  return totals;
}

/**
 * Load POS + online orders for the Sales summary report (date range inclusive).
 * @param {{ from: string, to: string }} range — ISO date strings YYYY-MM-DD
 * @returns {Promise<object[]>}
 */
export async function getSalesOrdersForReport(range) {
  const from = String(range?.from || '').trim();
  const to = String(range?.to || '').trim();
  if (!from || !to) throw new Error('Report date range is required.');

  const fromIso = `${from}T00:00:00.000Z`;
  const toDate = new Date(`${to}T00:00:00.000Z`);
  toDate.setUTCDate(toDate.getUTCDate() + 1);
  const toIso = toDate.toISOString();

  const { data, error } = await getSupabase()
    .from('orders')
    .select('id, source, status, total_amount, subtotal_amount, discount_amount, shipping_amount, payment_method, created_at, completed_at, updated_at, invoice_number, order_items(product_id, product_name, quantity, unit_price, wholesale_cost, refunded_quantity)')
    .in('source', ['pos', 'online'])
    .gte('created_at', fromIso)
    .lt('created_at', toIso)
    .order('created_at', { ascending: true })
    .limit(5000);

  if (error) {
    if (/Could not find the table|schema cache/i.test(error.message)) {
      throw new Error('Orders table not ready. Run the orders SQL scripts in Supabase.');
    }
    // Older DBs without refunded_quantity / discount_amount — retry without them
    if (/refunded_quantity|discount_amount|column/i.test(error.message)) {
      const retry = await getSupabase()
        .from('orders')
        .select('id, source, status, total_amount, subtotal_amount, shipping_amount, payment_method, created_at, completed_at, updated_at, invoice_number, order_items(product_id, product_name, quantity, unit_price, wholesale_cost)')
        .in('source', ['pos', 'online'])
        .gte('created_at', fromIso)
        .lt('created_at', toIso)
        .order('created_at', { ascending: true })
        .limit(5000);
      if (retry.error) throw mapSupabaseNetworkError(retry.error, 'loading sales report');
      return retry.data ?? [];
    }
    throw mapSupabaseNetworkError(error, 'loading sales report');
  }
  return data ?? [];
}

/**
 * Refund a completed POS sale — full invoice or a single line item.
 * @param {string} orderId
 * @param {{ orderItemId?: string, quantity?: number }} [opts]
 * @returns {Promise<object>}
 */
export async function refundPosOrder(orderId, opts = {}) {
  const id = String(orderId || '').trim();
  if (!id) throw new Error('Order id is required.');

  const order = await getOpenTicket(id);
  if (order.source !== 'pos') throw new Error('Only POS sales can be refunded here.');
  if (order.status === 'refunded') throw new Error('This sale was already refunded.');
  if (order.status !== 'completed') throw new Error('Only completed sales can be refunded.');

  const allItems = (order.order_items || []).filter(
    (item) => item.product_id && Number(item.quantity) > 0,
  );
  if (!allItems.length) throw new Error('Sale has no line items to refund.');

  const orderItemId = opts.orderItemId ? String(opts.orderItemId) : '';
  /** @type {Array<{ item: object, qty: number }>} */
  const targets = [];

  if (orderItemId) {
    const item = allItems.find((row) => String(row.id) === orderItemId);
    if (!item) throw new Error('Line item not found on this invoice.');
    const already = Number(item.refunded_quantity) || 0;
    const remaining = Math.max(0, Number(item.quantity) - already);
    if (remaining <= 0) throw new Error('This line was already fully refunded.');
    const qty = Math.min(
      remaining,
      Math.max(1, Number(opts.quantity) || remaining),
    );
    targets.push({ item, qty });
  } else {
    for (const item of allItems) {
      const already = Number(item.refunded_quantity) || 0;
      const remaining = Math.max(0, Number(item.quantity) - already);
      if (remaining > 0) targets.push({ item, qty: remaining });
    }
  }

  if (!targets.length) throw new Error('Nothing left to refund on this invoice.');

  const invoice = order.invoice_number || order.id;
  const restoreRows = targets.map(({ item, qty }) => ({
    product_id: item.product_id,
    quantity_changed: Math.abs(qty),
    type: 'refund',
    source: 'pos',
    notes: `Refund ${invoice}${orderItemId ? ` · line ${item.product_name || item.id}` : ''}`,
  }));

  const { error: inventoryError } = await getSupabase()
    .from('inventory_transactions')
    .insert(restoreRows);

  if (inventoryError) {
    if (/refund|inventory_transactions_type_check/i.test(inventoryError.message)) {
      throw new Error(
        'Refund blocked by database rules. Run sql/pos_refund.sql in the Supabase SQL Editor.',
      );
    }
    throw new Error(`Could not restore stock: ${inventoryError.message}`);
  }

  const now = new Date().toISOString();
  let refundAmount = 0;

  for (const { item, qty } of targets) {
    const already = Number(item.refunded_quantity) || 0;
    const nextRefunded = already + qty;
    refundAmount += qty * (Number(item.unit_price) || 0);

    const { error: lineError } = await getSupabase()
      .from('order_items')
      .update({ refunded_quantity: nextRefunded })
      .eq('id', item.id);

    if (lineError) {
      if (/refunded_quantity|column/i.test(lineError.message)) {
        throw new Error(
          'Partial refunds need sql/pos_payments_refunds.sql — run it in the Supabase SQL Editor.',
        );
      }
      throw new Error(`Could not update line refund: ${lineError.message}`);
    }
    item.refunded_quantity = nextRefunded;
  }

  const refreshed = await getOpenTicket(id);
  const lines = refreshed.order_items || [];
  const fullyRefunded = lines.length > 0 && lines.every((line) => {
    const qty = Number(line.quantity) || 0;
    const refunded = Number(line.refunded_quantity) || 0;
    return refunded >= qty;
  });

  const nextTotal = Math.max(0, (Number(order.total_amount) || 0) - refundAmount);
  const note = orderItemId
    ? `Partial refund ${now.slice(0, 10)} (−${refundAmount.toFixed(2)} LYD)`
    : `Refunded ${now.slice(0, 10)}`;

  const { data, error } = await getSupabase()
    .from('orders')
    .update({
      status: fullyRefunded ? 'refunded' : 'completed',
      total_amount: fullyRefunded ? 0 : nextTotal,
      updated_at: now,
      notes: [order.notes, note].filter(Boolean).join(' · '),
    })
    .eq('id', id)
    .eq('status', 'completed')
    .select('*')
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error('Sale could not be updated (already refunded?).');
  return data;
}

// ── Website orders (online storefront) ──────────────────────────────

/**
 * List website orders newest first.
 * @param {number} [limit]
 * @returns {Promise<object[]>}
 */
export async function getWebsiteOrders(limit = 50) {
  const { data, error } = await getSupabase()
    .from('orders')
    .select('*, order_items(*)')
    .eq('source', 'online')
    .order('created_at', { ascending: false })
    .limit(Math.max(1, Math.min(limit, 200)));

  if (error) {
    if (/Could not find the table|schema cache|column/i.test(error.message)) {
      throw new Error('Orders table not ready. Run sql/open_tickets.sql and sql/invoice_numbers.sql.');
    }
    throw mapSupabaseNetworkError(error, 'loading website orders');
  }
  return data ?? [];
}

/**
 * Fetch one website order with line items.
 * @param {string} orderId
 * @returns {Promise<{ order: object, items: object[] }>}
 */
export async function getWebsiteOrderDetail(orderId) {
  const id = String(orderId || '').trim();
  if (!id) throw new Error('Order id is required.');

  const { data: order, error } = await getSupabase()
    .from('orders')
    .select('*, order_items(*)')
    .eq('id', id)
    .eq('source', 'online')
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!order) throw new Error('Order not found.');

  return { order, items: order.order_items || [] };
}

/**
 * Update status on a website order (pending → completed / cancelled).
 * @param {string} orderId
 * @param {'pending'|'paid'|'completed'|'cancelled'} status
 */
export async function updateWebsiteOrderStatus(orderId, status) {
  const id = String(orderId || '').trim();
  const next = String(status || '').trim();
  if (!id) throw new Error('Order id is required.');
  if (!['pending', 'paid', 'completed', 'cancelled'].includes(next)) {
    throw new Error('Invalid order status.');
  }

  const now = new Date().toISOString();
  const patch = { status: next, updated_at: now };
  if (next === 'completed') patch.completed_at = now;

  const { data, error } = await getSupabase()
    .from('orders')
    .update(patch)
    .eq('id', id)
    .eq('source', 'online')
    .select('*')
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error('Order not found or could not be updated.');
  return data;
}

// ── Purchases / landed cost ─────────────────────────────────────────

/**
 * Record a supplier purchase invoice and allocate shipping/customs overhead
 * across its lines (landed cost), then create FIFO inventory batches and bump
 * product stock — all atomically via the process_supplier_invoice DB function.
 *
 * @param {{
 *   supplier_name: string,
 *   invoice_number?: string,
 *   invoice_date?: string,
 *   currency?: string,
 *   total_shipping_transport_cost?: number,
 *   total_customs_duties_cost?: number,
 *   notes?: string,
 * }} invoiceData
 * @param {Array<{ product_id: string, supplier_unit_price: number, quantity: number }>} lineItems
 * @returns {Promise<number>} The new invoice id.
 */
export async function createSupplierInvoice(invoiceData, lineItems) {
  if (!invoiceData?.supplier_name || !String(invoiceData.supplier_name).trim()) {
    throw new Error('Supplier name is required.');
  }
  const lines = (lineItems || [])
    .map((l) => ({
      product_id: String(l.product_id || '').trim(),
      supplier_unit_price: Number(l.supplier_unit_price) || 0,
      quantity: Math.trunc(Number(l.quantity) || 0),
    }))
    .filter((l) => l.product_id && l.quantity > 0);

  if (!lines.length) {
    throw new Error('Add at least one product line with a quantity.');
  }

  const payload = {
    supplier_name: String(invoiceData.supplier_name).trim(),
    invoice_number: invoiceData.invoice_number ? String(invoiceData.invoice_number).trim() : null,
    invoice_date: invoiceData.invoice_date ? String(invoiceData.invoice_date) : null,
    currency: invoiceData.currency ? String(invoiceData.currency).trim() : 'LYD',
    total_shipping_transport_cost: Number(invoiceData.total_shipping_transport_cost) || 0,
    total_customs_duties_cost: Number(invoiceData.total_customs_duties_cost) || 0,
    notes: invoiceData.notes ? String(invoiceData.notes).trim() : null,
  };

  const { data, error } = await getSupabase().rpc('process_supplier_invoice', {
    p_invoice: payload,
    p_lines: lines,
  });

  if (error) {
    if (/Could not find the function|process_supplier_invoice/i.test(error.message)) {
      throw new Error(
        'Purchase engine not installed. Run sql/accounting_fifo.sql, sql/supplier_invoices.sql, '
          + 'then sql/process_supplier_invoice.sql in the Supabase SQL Editor.',
      );
    }
    throw new Error(error.message);
  }

  return Number(data);
}

/**
 * List recent supplier invoices for the dashboard.
 * @param {number} [limit=25]
 * @returns {Promise<object[]>}
 */
export async function getSupplierInvoices(limit = 25) {
  const { data, error } = await getSupabase()
    .from('supplier_invoices')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    if (/Could not find the table|schema cache/i.test(error.message)) {
      return [];
    }
    throw new Error(error.message);
  }
  return data || [];
}

/**
 * Fetch one supplier invoice with its line items (and product names).
 * @param {number|string} invoiceId
 * @returns {Promise<{ invoice: object, items: object[] }>}
 */
export async function getSupplierInvoiceDetail(invoiceId) {
  const id = Number(invoiceId);
  const client = getSupabase();

  const { data: invoice, error: invoiceError } = await client
    .from('supplier_invoices')
    .select('*')
    .eq('id', id)
    .single();
  if (invoiceError) throw new Error(invoiceError.message);

  const { data: items, error: itemsError } = await client
    .from('supplier_invoice_items')
    .select('*')
    .eq('invoice_id', id)
    .order('id', { ascending: true });
  if (itemsError) throw new Error(itemsError.message);

  const rows = items || [];
  const productIds = [...new Set(rows.map((r) => r.product_id).filter(Boolean))];
  let namesById = {};
  if (productIds.length) {
    const { data: products } = await client
      .from('products')
      .select('id, name, barcode')
      .in('id', productIds);
    namesById = Object.fromEntries((products || []).map((p) => [String(p.id), p]));
  }

  const enriched = rows.map((r) => ({
    ...r,
    product_name: namesById[String(r.product_id)]?.name || '—',
    product_barcode: namesById[String(r.product_id)]?.barcode || '',
  }));

  return { invoice, items: enriched };
}

/**
 * Fetch everything related to Accounting & Purchases for a daily backup.
 * Tables that don't exist (partial installs) are skipped, not fatal.
 * @returns {Promise<Record<string, object[]>>}
 */
export async function getAccountingBackup() {
  const client = getSupabase();
  const tables = [
    'supplier_invoices',
    'supplier_invoice_items',
    'inventory_batches',
    'inventory_transactions',
    'sales_items',
    'inventory_waste',
    'operating_expenses',
  ];

  const result = {};
  await Promise.all(
    tables.map(async (name) => {
      try {
        const { data, error } = await client
          .from(name)
          .select('*')
          .order('id', { ascending: true });
        if (error) {
          // Missing table / no id column — try a plain select, else skip.
          if (/Could not find the table|schema cache|column .*id.* does not exist/i.test(error.message)) {
            const retry = await client.from(name).select('*');
            result[name] = retry.error ? [] : (retry.data || []);
          } else {
            result[name] = [];
          }
        } else {
          result[name] = data || [];
        }
      } catch {
        result[name] = [];
      }
    }),
  );

  return result;
}

// ── Inventory waste / spoilage ──────────────────────────────────────

/**
 * Record wasted / spoiled / damaged stock. Deducts FIFO from inventory batches,
 * lowers product stock, and captures the cost — all atomically via the
 * process_inventory_waste DB function.
 *
 * @param {string} productId
 * @param {number} quantity
 * @param {string} reason
 * @returns {Promise<number>} Total cost of the wasted stock.
 */
export async function recordInventoryWaste(productId, quantity, reason) {
  const pid = String(productId || '').trim();
  const qty = Math.trunc(Number(quantity) || 0);
  if (!pid) throw new Error('Select a product.');
  if (qty <= 0) throw new Error('Enter a quantity greater than zero.');

  const { data, error } = await getSupabase().rpc('process_inventory_waste', {
    p_product_id: pid,
    p_quantity: qty,
    p_reason: reason ? String(reason).trim() : null,
  });

  if (error) {
    if (/Could not find the function|process_inventory_waste/i.test(error.message)) {
      throw new Error(
        'Waste engine not installed. Run sql/accounting_fifo.sql then '
          + 'sql/process_inventory_waste.sql in the Supabase SQL Editor.',
      );
    }
    throw new Error(error.message);
  }
  return Number(data) || 0;
}

/**
 * List recent waste records with product names and line cost.
 * @param {number} [limit=25]
 * @returns {Promise<object[]>}
 */
export async function getWasteRecords(limit = 25) {
  const client = getSupabase();
  const { data, error } = await client
    .from('inventory_waste')
    .select('*')
    .order('recorded_at', { ascending: false })
    .limit(limit);

  if (error) {
    if (/Could not find the table|schema cache/i.test(error.message)) return [];
    throw new Error(error.message);
  }

  const rows = data || [];
  const productIds = [...new Set(rows.map((r) => r.product_id).filter(Boolean))];
  let namesById = {};
  if (productIds.length) {
    const { data: products } = await client
      .from('products')
      .select('id, name')
      .in('id', productIds);
    namesById = Object.fromEntries((products || []).map((p) => [String(p.id), p.name]));
  }

  return rows.map((r) => ({
    ...r,
    product_name: namesById[String(r.product_id)] || '—',
    line_cost: (Number(r.unit_cost) || 0) * (Number(r.quantity) || 0),
  }));
}

// ── Categories & collections (taxonomy) ─────────────────────────────

const FK_BLOCKED_RE = /foreign key|violates foreign key|23503/i;

/**
 * @param {string} table
 * @returns {Promise<object[]>}
 */
export async function getCategories() {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .order('name', { ascending: true });

  if (error) {
    if (/Could not find the table|schema cache/i.test(error.message)) {
      throw new Error(
        'Missing table public.categories. Run sql/catalog_schema.sql in the Supabase SQL Editor, then refresh.',
      );
    }
    throw new Error(error.message);
  }
  return data ?? [];
}

/**
 * @returns {Promise<object[]>}
 */
export async function getCollections() {
  const { data, error } = await supabase
    .from('collections')
    .select('*')
    .order('name', { ascending: true });

  if (error) {
    if (/Could not find the table|schema cache/i.test(error.message)) {
      throw new Error(
        'Missing table public.collections. Run sql/catalog_schema.sql in the Supabase SQL Editor, then refresh.',
      );
    }
    throw new Error(error.message);
  }
  return data ?? [];
}

/**
 * Count products still linked to a category.
 * @param {string} categoryId
 */
async function countProductsForCategory(categoryId) {
  const { count, error } = await supabase
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('category_id', categoryId);

  if (error) throw new Error(error.message);
  return count ?? 0;
}

/**
 * Count products still linked to a collection.
 * @param {string} collectionId
 */
async function countProductsForCollection(collectionId) {
  const { count, error } = await supabase
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('collection_id', collectionId);

  if (error) throw new Error(error.message);
  return count ?? 0;
}

/**
 * Delete a category after migrating product references in Supabase.
 *
 * @param {string} id
 * @param {{
 *   mode?: 'null' | 'block' | 'reassign',
 *   reassignTo?: string | null,
 *   reassignToName?: string,
 * }} [options]
 * @returns {Promise<{ ok: true, id: string, reassigned: number }>}
 */
export async function deleteCategory(id, options = {}) {
  const categoryId = String(id || '').trim();
  if (!isLiveDbId(categoryId)) {
    throw new Error('Category id must be a live Supabase UUID.');
  }

  const mode = options.mode || 'reassign';

  try {
    const { data: existing, error: loadError } = await supabase
      .from('categories')
      .select('*')
      .eq('id', categoryId)
      .maybeSingle();

    if (loadError) throw new Error(loadError.message);
    if (!existing) throw new Error('Category not found.');

    let linked = 0;
    try {
      linked = await countProductsForCategory(categoryId);
    } catch (countErr) {
      console.warn('[shared/supabase] category product count skipped:', countErr.message);
    }

    const oldName = existing.name;

    if (linked > 0 && mode === 'block') {
      throw new Error(
        'Cannot delete this category because products are still assigned to it. Please reassign the products first.',
      );
    }

    if (mode !== 'block') {
      // Resolve an explicit reassignment target. Only reassign when the caller
      // actually asks for it — never silently create a "General" bucket.
      let targetId = isLiveDbId(options.reassignTo) ? String(options.reassignTo).trim() : '';
      const targetName = String(options.reassignToName || '').trim();

      if (mode === 'reassign' && !targetId && targetName) {
        const dest = await ensureNamedCategory(targetName);
        targetId = dest.id;
      }

      const reassigning = mode === 'reassign' && isLiveDbId(targetId);

      if (reassigning) {
        const { error: moveError } = await supabase
          .from('products')
          .update({ category_id: targetId, updated_at: new Date().toISOString() })
          .eq('category_id', categoryId);
        if (moveError) console.warn('[shared/supabase] category_id migrate:', moveError.message);
      } else {
        // No target → leave products uncategorized (FK is ON DELETE SET NULL).
        const { error: clearError } = await supabase
          .from('products')
          .update({ category_id: null, updated_at: new Date().toISOString() })
          .eq('category_id', categoryId);
        if (clearError) console.warn('[shared/supabase] category_id clear:', clearError.message);
      }

      if (oldName) {
        const destName = reassigning ? targetName : null;
        const { error: textError } = await supabase
          .from('products')
          .update({ category: destName, updated_at: new Date().toISOString() })
          .eq('category', oldName);
        if (textError) console.warn('[shared/supabase] category text migrate:', textError.message);
      }
    }

    const { error: deleteError } = await supabase
      .from('categories')
      .delete()
      .eq('id', categoryId);

    if (deleteError) {
      console.error('[shared/supabase] deleteCategory query failed:', deleteError);
      if (FK_BLOCKED_RE.test(deleteError.message)) {
        throw new Error(
          'Cannot delete this category because products are still assigned to it. Please reassign the products first.',
        );
      }
      throw new Error(deleteError.message);
    }

    return { ok: true, id: categoryId, reassigned: linked };
  } catch (err) {
    console.error('[shared/supabase] deleteCategory failed:', err);
    throw mapSupabaseNetworkError(err, 'deleting category');
  }
}

/**
 * Delete a collection after migrating product references in Supabase.
 *
 * @param {string} id
 * @param {{
 *   mode?: 'null' | 'block' | 'reassign',
 *   reassignTo?: string | null,
 *   reassignToName?: string,
 * }} [options]
 * @returns {Promise<{ ok: true, id: string, reassigned: number }>}
 */
export async function deleteCollection(id, options = {}) {
  const collectionId = String(id || '').trim();
  if (!isLiveDbId(collectionId)) {
    throw new Error('Collection id must be a live Supabase UUID.');
  }

  const mode = options.mode || 'reassign';

  try {
    const { data: existing, error: loadError } = await supabase
      .from('collections')
      .select('*')
      .eq('id', collectionId)
      .maybeSingle();

    if (loadError) throw new Error(loadError.message);
    if (!existing) throw new Error('Collection not found.');

    let linked = 0;
    try {
      linked = await countProductsForCollection(collectionId);
    } catch (countErr) {
      console.warn('[shared/supabase] collection product count skipped:', countErr.message);
    }

    const oldName = existing.name;

    if (linked > 0 && mode === 'block') {
      throw new Error(
        'Cannot delete this collection because products are still assigned to it. Please reassign the products first.',
      );
    }

    if (mode !== 'block') {
      // Resolve an explicit reassignment target. Only reassign when the caller
      // actually asks for it — never silently create a "General" bucket.
      let targetId = isLiveDbId(options.reassignTo) ? String(options.reassignTo).trim() : '';
      const targetName = String(options.reassignToName || '').trim();

      if (mode === 'reassign' && !targetId && targetName) {
        const dest = await ensureNamedCollection(targetName);
        targetId = dest.id;
      }

      const reassigning = mode === 'reassign' && isLiveDbId(targetId);

      if (reassigning) {
        const { error: moveError } = await supabase
          .from('products')
          .update({ collection_id: targetId, updated_at: new Date().toISOString() })
          .eq('collection_id', collectionId);
        if (moveError) console.warn('[shared/supabase] collection_id migrate:', moveError.message);
      } else {
        // No target → leave products uncategorized (FK is ON DELETE SET NULL).
        const { error: clearError } = await supabase
          .from('products')
          .update({ collection_id: null, updated_at: new Date().toISOString() })
          .eq('collection_id', collectionId);
        if (clearError) console.warn('[shared/supabase] collection_id clear:', clearError.message);
      }

      if (oldName) {
        const destName = reassigning ? targetName : null;
        for (const col of ['collection', 'collection_name', 'category']) {
          const { error: textError } = await supabase
            .from('products')
            .update({ [col]: destName, updated_at: new Date().toISOString() })
            .eq(col, oldName);
          if (textError) console.warn(`[shared/supabase] ${col} migrate:`, textError.message);
        }
      }
    }

    const { error: deleteError } = await supabase
      .from('collections')
      .delete()
      .eq('id', collectionId);

    if (deleteError) {
      console.error('[shared/supabase] deleteCollection query failed:', deleteError);
      if (FK_BLOCKED_RE.test(deleteError.message)) {
        throw new Error(
          'Cannot delete this collection because products are still assigned to it. Please reassign the products first.',
        );
      }
      throw new Error(deleteError.message);
    }

    return { ok: true, id: collectionId, reassigned: linked };
  } catch (err) {
    console.error('[shared/supabase] deleteCollection failed:', err);
    throw mapSupabaseNetworkError(err, 'deleting collection');
  }
}


