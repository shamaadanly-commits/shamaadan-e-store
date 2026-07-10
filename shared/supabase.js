/**
 * Shared Supabase client — Dashboard + POS backend.
 * Schema: products, orders, order_items, inventory_transactions
 * Stock is adjusted by a DB trigger on inventory_transactions inserts.
 */
import { createClient } from '@supabase/supabase-js';

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

const supabaseUrl = readEnv('VITE_SUPABASE_URL');
const supabaseAnonKey = readEnv('VITE_SUPABASE_ANON_KEY');

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '[shared/supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Set them in .env / Vercel.',
  );
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
  {
    auth: {
      persistSession: typeof window !== 'undefined',
      autoRefreshToken: typeof window !== 'undefined',
      detectSessionInUrl: typeof window !== 'undefined',
    },
  },
);

export function getSupabase() {
  return supabase;
}

/**
 * Fetch all products (active first).
 * @returns {Promise<object[]>}
 */
export async function getProducts() {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .order('name', { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
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
 * @param {{ source?: string, status?: string, total_amount?: number, notes?: string }} orderData
 * @param {Array<{ product_id: string, quantity: number, unit_price: number, wholesale_cost?: number }>} itemsArray
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

  const total_amount = Number.isFinite(Number(orderData?.total_amount))
    ? Number(orderData.total_amount)
    : items.reduce(
      (sum, item) => sum + Number(item.unit_price) * Number(item.quantity),
      0,
    );

  // 1) Insert order
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      source: orderData?.source || 'pos',
      status: orderData?.status || 'completed',
      total_amount,
    })
    .select('*')
    .single();

  if (orderError) throw new Error(`Order failed: ${orderError.message}`);

  // 2) Insert line items
  const orderItemRows = items.map((item) => ({
    order_id: order.id,
    product_id: item.product_id,
    quantity: Number(item.quantity),
    unit_price: Number(item.unit_price),
    wholesale_cost: Number(item.wholesale_cost ?? 0),
  }));

  const { data: insertedItems, error: itemsError } = await supabase
    .from('order_items')
    .insert(orderItemRows)
    .select('*');

  if (itemsError) {
    // Best-effort cleanup so we don't leave orphan orders
    await supabase.from('orders').delete().eq('id', order.id);
    throw new Error(`Order items failed: ${itemsError.message}`);
  }

  // 3) Inventory deductions (negative quantity_changed → trigger decrements stock)
  const inventoryRows = items.map((item) => ({
    product_id: item.product_id,
    quantity_changed: -Math.abs(Number(item.quantity)),
    type: 'sale',
    source: orderData?.source || 'pos',
    notes: `Order ${order.id}`,
  }));

  const { data: inventory, error: inventoryError } = await supabase
    .from('inventory_transactions')
    .insert(inventoryRows)
    .select('*');

  if (inventoryError) {
    throw new Error(
      `Sale saved but inventory log failed: ${inventoryError.message}. Check stock manually for order ${order.id}.`,
    );
  }

  return {
    order,
    items: insertedItems ?? [],
    inventory: inventory ?? [],
  };
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

  if (error) throw new Error(error.message);
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

  if (error) throw new Error(error.message);
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
 * Delete a category after clearing (or blocking on) product references.
 *
 * @param {string} id
 * @param {{
 *   mode?: 'null' | 'block' | 'reassign',
 *   reassignTo?: string | null,
 * }} [options]
 *   - `null` (default): set products.category_id = null, then delete
 *   - `block`: refuse if any products still reference this category
 *   - `reassign`: move products to options.reassignTo, then delete
 * @returns {Promise<{ ok: true, id: string, reassigned: number }>}
 */
export async function deleteCategory(id, options = {}) {
  const categoryId = String(id || '').trim();
  if (!categoryId) throw new Error('Category id is required');

  const mode = options.mode || 'null';

  try {
    const linked = await countProductsForCategory(categoryId);

    if (linked > 0 && mode === 'block') {
      throw new Error(
        'Cannot delete this category because products are still assigned to it. Please reassign the products first.',
      );
    }

    if (linked > 0 && mode === 'reassign') {
      const target = options.reassignTo == null ? null : String(options.reassignTo).trim();
      if (!target) {
        throw new Error('reassignTo category id is required when mode is "reassign".');
      }
      const { error: moveError } = await supabase
        .from('products')
        .update({ category_id: target, updated_at: new Date().toISOString() })
        .eq('category_id', categoryId);
      if (moveError) throw new Error(moveError.message);
    } else if (linked > 0) {
      // Default: detach products so the FK cannot block deletion
      const { error: clearError } = await supabase
        .from('products')
        .update({ category_id: null, updated_at: new Date().toISOString() })
        .eq('category_id', categoryId);
      if (clearError) throw new Error(clearError.message);
    }

    const { error: deleteError } = await supabase
      .from('categories')
      .delete()
      .eq('id', categoryId);

    if (deleteError) {
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
    throw err instanceof Error ? err : new Error(String(err));
  }
}

/**
 * Delete a collection after clearing (or blocking on) product references.
 *
 * @param {string} id
 * @param {{
 *   mode?: 'null' | 'block' | 'reassign',
 *   reassignTo?: string | null,
 * }} [options]
 * @returns {Promise<{ ok: true, id: string, reassigned: number }>}
 */
export async function deleteCollection(id, options = {}) {
  const collectionId = String(id || '').trim();
  if (!collectionId) throw new Error('Collection id is required');

  const mode = options.mode || 'null';

  try {
    const linked = await countProductsForCollection(collectionId);

    if (linked > 0 && mode === 'block') {
      throw new Error(
        'Cannot delete this collection because products are still assigned to it. Please reassign the products first.',
      );
    }

    if (linked > 0 && mode === 'reassign') {
      const target = options.reassignTo == null ? null : String(options.reassignTo).trim();
      if (!target) {
        throw new Error('reassignTo collection id is required when mode is "reassign".');
      }
      const { error: moveError } = await supabase
        .from('products')
        .update({ collection_id: target, updated_at: new Date().toISOString() })
        .eq('collection_id', collectionId);
      if (moveError) throw new Error(moveError.message);
    } else if (linked > 0) {
      const { error: clearError } = await supabase
        .from('products')
        .update({ collection_id: null, updated_at: new Date().toISOString() })
        .eq('collection_id', collectionId);
      if (clearError) throw new Error(clearError.message);
    }

    const { error: deleteError } = await supabase
      .from('collections')
      .delete()
      .eq('id', collectionId);

    if (deleteError) {
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
    throw err instanceof Error ? err : new Error(String(err));
  }
}

