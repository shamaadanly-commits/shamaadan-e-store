/**
 * Product data layer — Supabase `public.products` (live stock) → local catalog → mock.
 * Reads stock_quantity / min_stock_alert / retail_price from the unified schema.
 */
import { getSupabase } from '../config/supabase.js';
import { MOCK_PRODUCTS } from '../shared/mock-products.js';
import {
  loadStoreCatalog,
  normalizeStoreProduct,
  buildCollectionsFromProducts,
  buildCategoriesFromProducts,
} from '../shared/catalog-store.js';
import { productCardHtml } from './template.js';

/**
 * Map a Supabase products row into the storefront product shape.
 * @param {object} row
 */
function mapSupabaseProduct(row) {
  const imageUrl = row.image_url || null;
  const imageUrls = Array.isArray(row.image_urls)
    ? row.image_urls.filter(Boolean)
    : imageUrl
      ? [imageUrl]
      : row.image
        ? [row.image]
        : [];

  return normalizeStoreProduct({
    id: row.id,
    barcode: row.barcode ?? row.sku ?? '',
    sku: row.sku ?? row.barcode ?? '',
    name: row.name,
    title: row.name,
    description: row.description ?? '',
    category: row.category ?? 'General',
    collectionName: row.category ?? 'General',
    retailPrice: Number(row.retail_price ?? row.price ?? 0),
    price: Number(row.retail_price ?? row.price ?? 0),
    wholesale_cost: Number(row.wholesale_cost ?? row.cost ?? 0),
    cost: Number(row.wholesale_cost ?? row.cost ?? 0),
    stock_quantity: Number(row.stock_quantity ?? row.stock ?? 0),
    stock: Number(row.stock_quantity ?? row.stock ?? 0),
    min_stock_alert: Number(row.min_stock_alert ?? 5),
    imageUrls,
    image: imageUrls[0] ?? null,
    active: row.is_active !== false && row.active !== false,
    is_active: row.is_active !== false && row.active !== false,
  });
}

/**
 * @returns {Promise<{ products: Array, categories: string[], collections: Array, connected: boolean }>}
 */
export async function loadProducts() {
  const shared = loadStoreCatalog();
  let managedCollections = shared?.collections || [];
  let managedCategories = shared?.categories || [];
  let products = [];
  let connected = false;

  const supabase = getSupabase();

  // Prefer live Supabase inventory so stock_quantity stays in sync with POS
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('id, barcode, name, description, image_url, wholesale_cost, retail_price, stock_quantity, min_stock_alert, is_active, created_at')
        .eq('is_active', true)
        .order('name');

      if (!error && data?.length) {
        products = data.map(mapSupabaseProduct);
        connected = true;
      } else if (error) {
        console.warn('[storefront] Supabase products error:', error.message);
      }
    } catch (err) {
      console.warn('[storefront] Supabase product load failed:', err);
    }
  }

  // Fallback: admin localStorage catalog, then mocks
  if (!products.length && shared?.products?.length) {
    products = shared.products.map(normalizeStoreProduct);
    connected = true;
  }

  if (!products.length) {
    products = MOCK_PRODUCTS.map(normalizeStoreProduct);
  }

  const collections = buildCollectionsFromProducts(products, managedCollections);
  const categoryRecords = buildCategoriesFromProducts(products, managedCategories);
  const categories = categoryRecords.map((c) => c.name);

  return { products, categories, collections, connected };
}

/**
 * Filter products by category / collection name.
 * @param {Array} products
 * @param {string} filter
 */
export function filterProducts(products, filter) {
  if (!filter || filter === 'All') return products;
  return products.filter((p) => p.category === filter || p.collectionName === filter);
}

/**
 * Re-render the product grid.
 * @param {HTMLElement} gridEl
 * @param {Array} products
 * @param {ReturnType<import('./i18n.js').createI18n>} i18n
 */
export function renderProductGrid(gridEl, products, i18n) {
  if (!products.length) {
    gridEl.innerHTML = `<p class="shop__lead">${i18n.t('shop.empty')}</p>`;
    return;
  }
  gridEl.innerHTML = products.map((p) => productCardHtml(p, i18n)).join('');
}
