/**
 * Admin catalog sync — all mutations go through Supabase, then local state is rehydrated.
 * Uses the browser Supabase client (window.__ENV__ via shared/supabase.js).
 */
import {
  getProducts,
  getCategories,
  getCollections,
  deleteCategory as sbDeleteCategory,
  deleteCollection as sbDeleteCollection,
  ensureNamedCategory,
  ensureNamedCollection,
  upsertCategoryRow,
  upsertCollectionRow,
  upsertProductRow,
  deleteProductRow,
  mapProductFromDb,
} from '../../shared/supabase.js';

/**
 * Pull live catalog from Supabase into dashboard-friendly shapes.
 */
export async function fetchAdminCatalog() {
  const [rawProducts, rawCategories, rawCollections] = await Promise.all([
    getProducts(),
    getCategories().catch((err) => {
      console.error('[catalog-api] getCategories failed:', err);
      return [];
    }),
    getCollections().catch((err) => {
      console.error('[catalog-api] getCollections failed:', err);
      return [];
    }),
  ]);

  const categories = (rawCategories || []).map((c) => ({
    id: String(c.id),
    name: String(c.name || 'Untitled'),
    description: c.description ? String(c.description) : '',
  }));

  const collections = (rawCollections || []).map((c) => ({
    id: String(c.id),
    name: String(c.name || 'Untitled'),
    description: c.description ? String(c.description) : '',
  }));

  const categoryById = new Map(categories.map((c) => [c.id, c.name]));
  const collectionById = new Map(collections.map((c) => [c.id, c.name]));

  const products = (rawProducts || []).map((row) => {
    const mapped = mapProductFromDb(row);
    if (row.category_id && categoryById.has(row.category_id)) {
      mapped.category = categoryById.get(row.category_id);
    }
    if (row.collection_id && collectionById.has(row.collection_id)) {
      mapped.collectionName = collectionById.get(row.collection_id);
    }
    return mapped;
  });

  return { products, categories, collections };
}

/**
 * Delete collection in Supabase (migrate products → General first), then return fresh catalog.
 * @param {string} id
 * @param {string} [reassignToName='General']
 */
export async function persistDeleteCollection(id, reassignToName = 'General') {
  const targetName = String(reassignToName || 'General').trim() || 'General';
  console.info('[catalog-api] deleteCollection', { id, reassignToName: targetName });

  const general = await ensureNamedCollection(targetName);
  await sbDeleteCollection(id, {
    mode: 'reassign',
    reassignTo: general.id,
    reassignToName: targetName,
  });

  return fetchAdminCatalog();
}

/**
 * Delete category in Supabase (migrate products → General first), then return fresh catalog.
 * @param {string} id
 * @param {string} [reassignToName='General']
 */
export async function persistDeleteCategory(id, reassignToName = 'General') {
  const targetName = String(reassignToName || 'General').trim() || 'General';
  console.info('[catalog-api] deleteCategory', { id, reassignToName: targetName });

  const general = await ensureNamedCategory(targetName);
  await sbDeleteCategory(id, {
    mode: 'reassign',
    reassignTo: general.id,
    reassignToName: targetName,
  });

  return fetchAdminCatalog();
}

/**
 * @param {{ id?: string, name: string, description?: string }} input
 * @param {string} [renameFrom]
 */
export async function persistUpsertCollection(input, renameFrom = '') {
  console.info('[catalog-api] upsertCollection', input);
  await upsertCollectionRow(input, renameFrom);
  return fetchAdminCatalog();
}

/**
 * @param {{ id?: string, name: string, description?: string }} input
 * @param {string} [renameFrom]
 */
export async function persistUpsertCategory(input, renameFrom = '') {
  console.info('[catalog-api] upsertCategory', input);
  await upsertCategoryRow(input, renameFrom);
  return fetchAdminCatalog();
}

/**
 * @param {object} product — dashboard product shape
 */
export async function persistUpsertProduct(product) {
  console.info('[catalog-api] upsertProduct', product?.id, product?.title || product?.name);
  await upsertProductRow(product);
  return fetchAdminCatalog();
}

/**
 * Hard-delete a product row in Supabase.
 * @param {string} productId
 */
export async function persistDeleteProduct(productId) {
  console.info('[catalog-api] deleteProduct', productId);
  await deleteProductRow(productId);
  return fetchAdminCatalog();
}

/**
 * @returns {boolean}
 */
export function isSupabaseReady() {
  const env = typeof window !== 'undefined' ? window.__ENV__ : null;
  return Boolean(env?.VITE_SUPABASE_URL && env?.VITE_SUPABASE_ANON_KEY);
}
