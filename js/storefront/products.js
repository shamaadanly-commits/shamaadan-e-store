/**
 * Storefront catalog — live Supabase only (same source of truth as Admin).
 * No localStorage catalog and no MOCK_PRODUCTS fallback when Supabase is configured.
 */
import {
  getSupabase,
  isSupabaseConfigured,
  mapProductFromDb,
  mapSupabaseNetworkError,
} from '../../shared/supabase.js';
import { normalizeStoreProduct } from '../shared/catalog-store.js';
import { productCardHtml } from './template.js';

const COLLECTION_GRADIENTS = [
  'linear-gradient(160deg, #2a1f14 0%, #1c1914 60%, #242019 100%)',
  'linear-gradient(200deg, #1a1814 0%, #2a2018 50%, #1c1914 100%)',
  'linear-gradient(140deg, #1e1a10 0%, #3a2a18 40%, #1c1914 100%)',
  'linear-gradient(180deg, #241a10 0%, #1c1914 100%)',
  'linear-gradient(160deg, #1a2018 0%, #1c1914 100%)',
  'linear-gradient(200deg, #201a14 0%, #1c1914 100%)',
];

/**
 * Map a DB product row into the storefront card shape (stock_quantity → stockQuantity).
 * @param {object} row
 */
function toStorefrontProduct(row) {
  const mapped = mapProductFromDb(row);
  return normalizeStoreProduct({
    ...mapped,
    stock_quantity: mapped.stockQuantity,
    stock: mapped.stockQuantity,
    min_stock_alert: mapped.minStockAlert,
  });
}

/**
 * @param {object[]} products
 * @param {Array<{ id: string, name: string, description?: string }>} managedCollections
 */
function buildCollectionCards(products, managedCollections) {
  const counts = new Map();
  for (const product of products) {
    const name = product.collectionName || product.category || 'General';
    counts.set(name, (counts.get(name) || 0) + 1);
  }

  if (managedCollections.length) {
    return managedCollections.map((c, i) => ({
      id: String(c.id),
      name: String(c.name || 'Untitled'),
      description: c.description ? String(c.description) : '',
      count: counts.get(c.name) || 0,
      gradient: COLLECTION_GRADIENTS[i % COLLECTION_GRADIENTS.length],
    }));
  }

  return [...counts.entries()].map(([name, count], i) => ({
    id: name.toLowerCase().replace(/\s+/g, '-'),
    name,
    count,
    gradient: COLLECTION_GRADIENTS[i % COLLECTION_GRADIENTS.length],
  }));
}

/**
 * Load active products + taxonomy directly from Supabase.
 * @returns {Promise<{ products: Array, categories: string[], collections: Array, connected: boolean }>}
 */
export async function loadProducts() {
  if (!isSupabaseConfigured()) {
    console.warn('[storefront] Supabase not configured — showing empty catalog');
    return { products: [], categories: [], collections: [], connected: false };
  }

  const supabase = getSupabase();

  try {
    const [productsRes, categoriesRes, collectionsRes] = await Promise.all([
      supabase
        .from('products')
        .select('*')
        .eq('is_active', true)
        .eq('show_on_website', true)
        .order('name', { ascending: true }),
      supabase.from('categories').select('*').order('name', { ascending: true }),
      supabase.from('collections').select('*').order('name', { ascending: true }),
    ]);

    if (productsRes.error) {
      // show_on_website column may not exist until sql/show_on_website.sql is applied.
      if (/show_on_website|column.*does not exist/i.test(productsRes.error.message)) {
        const fallback = await supabase
          .from('products')
          .select('*')
          .eq('is_active', true)
          .order('name', { ascending: true });
        if (fallback.error) throw new Error(fallback.error.message);
        productsRes.data = fallback.data;
        productsRes.error = null;
      } else {
        throw new Error(productsRes.error.message);
      }
    }

    const categoryRows = categoriesRes.error ? [] : (categoriesRes.data || []);
    const collectionRows = collectionsRes.error ? [] : (collectionsRes.data || []);

    if (categoriesRes.error) {
      console.warn('[storefront] categories query:', categoriesRes.error.message);
    }
    if (collectionsRes.error) {
      console.warn('[storefront] collections query:', collectionsRes.error.message);
    }

    const categoryById = new Map(categoryRows.map((c) => [String(c.id), String(c.name || 'General')]));
    const collectionById = new Map(collectionRows.map((c) => [String(c.id), String(c.name || 'General')]));

    const products = (productsRes.data || [])
      .filter((row) => row.show_on_website !== false)
      .map((row) => {
      const product = toStorefrontProduct(row);
      if (row.category_id && categoryById.has(String(row.category_id))) {
        product.category = categoryById.get(String(row.category_id));
      }
      if (row.collection_id && collectionById.has(String(row.collection_id))) {
        product.collectionName = collectionById.get(String(row.collection_id));
      } else if (!product.collectionName || product.collectionName === 'General') {
        product.collectionName = product.category || 'General';
      }
      return product;
    });

    const categories = categoryRows.length
      ? categoryRows.map((c) => String(c.name || 'Untitled')).filter(Boolean)
      : [...new Set(products.map((p) => p.category).filter(Boolean))];

    const collections = buildCollectionCards(
      products,
      collectionRows.map((c) => ({
        id: String(c.id),
        name: String(c.name || 'Untitled'),
        description: c.description ? String(c.description) : '',
      })),
    );

    console.info('[storefront] live catalog', {
      products: products.length,
      categories: categories.length,
      collections: collections.length,
    });

    return {
      products,
      categories,
      collections,
      connected: true,
    };
  } catch (err) {
    const mapped = mapSupabaseNetworkError(err, 'loading the storefront catalog');
    console.error('[storefront] loadProducts failed:', mapped);
    throw mapped;
  }
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
 * @param {Map<string, number>|Record<string, number>} [qtyById]
 */
export function renderProductGrid(gridEl, products, i18n, qtyById = {}) {
  if (!products.length) {
    gridEl.innerHTML = `<p class="shop__lead">${i18n.t('shop.empty')}</p>`;
    return;
  }
  const getQty = (id) => {
    if (qtyById instanceof Map) return Number(qtyById.get(String(id)) || 0);
    return Number(qtyById[id] || qtyById[String(id)] || 0);
  };
  gridEl.innerHTML = products.map((p) => productCardHtml({ ...p, _cartQty: getQty(p.id) }, i18n)).join('');
}
