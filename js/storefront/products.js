/**
 * Product data layer — shared catalog (admin) → Supabase → mock fallback.
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
 * @returns {Promise<{ products: Array, categories: string[], collections: Array, connected: boolean }>}
 */
export async function loadProducts() {
  const shared = loadStoreCatalog();
  let products = shared?.products?.length
    ? shared.products.map(normalizeStoreProduct)
    : MOCK_PRODUCTS.map(normalizeStoreProduct);

  let managedCollections = shared?.collections || [];
  let managedCategories = shared?.categories || [];

  const supabase = getSupabase();
  let connected = false;

  if (!shared?.products?.length && supabase) {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('id, sku, barcode, name, category, price, cost, stock, image_urls, image')
        .eq('active', true)
        .order('name');

      if (!error && data?.length) {
        products = data.map((row) => normalizeStoreProduct({
          id: row.id,
          sku: row.sku,
          barcode: row.barcode ?? row.sku,
          name: row.name,
          category: row.category ?? 'General',
          collectionName: row.category ?? 'General',
          price: Number(row.price),
          cost: Number(row.cost ?? 0),
          stock: row.stock ?? 0,
          imageUrls: row.image_urls ?? (row.image ? [row.image] : []),
        }));
        connected = true;
      }
    } catch {
      // Keep mock / shared catalog
    }
  } else if (shared?.products?.length) {
    connected = true;
  }

  const collections = buildCollectionsFromProducts(products, managedCollections);
  const categoryRecords = buildCategoriesFromProducts(products, managedCategories);
  const categories = categoryRecords.map((c) => c.name);

  return { products, categories, collections, connected };
}

/**
 * Filter products by category / collection name.
 * @param {Array} products
 * @param {string} filter - "All" or category/collection name
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
