/**
 * Product data layer — Supabase fetch with mock fallback.
 */
import { getSupabase } from '../config/supabase.js';
import { MOCK_PRODUCTS } from '../shared/mock-products.js';
import { productCardHtml } from './template.js';

/**
 * @returns {Promise<{ products: Array, categories: string[], connected: boolean }>}
 */
export async function loadProducts() {
  const supabase = getSupabase();
  let products = [...MOCK_PRODUCTS];

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('id, sku, name, category, price, stock')
        .eq('active', true)
        .order('name');

      if (!error && data?.length) {
        products = data.map((row) => ({
          id: row.id,
          sku: row.sku,
          name: row.name,
          category: row.category ?? 'General',
          price: Number(row.price),
          stock: row.stock ?? 0,
        }));
      }
    } catch {
      // Keep mock catalog
    }
  }

  const categories = [...new Set(products.map((p) => p.category))].sort();

  return { products, categories, connected: Boolean(supabase) };
}

/**
 * Filter products by category name.
 * @param {Array} products
 * @param {string} filter - "All" or category name
 */
export function filterProducts(products, filter) {
  if (!filter || filter === 'All') return products;
  return products.filter((p) => p.category === filter);
}

/**
 * Re-render the product grid.
 * @param {HTMLElement} gridEl
 * @param {Array} products
 */
export function renderProductGrid(gridEl, products) {
  if (!products.length) {
    gridEl.innerHTML = '<p class="shop__lead">No products in this collection yet.</p>';
    return;
  }
  gridEl.innerHTML = products.map((p) => productCardHtml(p)).join('');
}
