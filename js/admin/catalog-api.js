/**
 * Admin catalog sync — all mutations go through Supabase, then local state is rehydrated.
 * Uses the browser Supabase client (window.__ENV__ via shared/supabase.js).
 * No /api/* delete endpoints — deletes are direct supabase.from(...).delete() calls.
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
  deleteSupabaseProductImages,
  mapProductFromDb,
  isSupabaseConfigured,
  mapSupabaseNetworkError,
} from '../../shared/supabase.js';

function assertLiveSupabase() {
  if (!isSupabaseConfigured()) {
    throw new Error(
      'Supabase is not configured on this deployment. '
        + 'Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Vercel → Environment Variables, then redeploy.',
    );
  }
}

/**
 * Pull live catalog from Supabase into dashboard-friendly shapes.
 */
export async function fetchAdminCatalog() {
  assertLiveSupabase();

  try {
    const [rawProducts, rawCategories, rawCollections] = await Promise.all([
      getProducts(),
      getCategories().catch((err) => {
        console.error('[catalog-api] getCategories failed:', err);
        throw err;
      }),
      getCollections().catch((err) => {
        console.error('[catalog-api] getCollections failed:', err);
        throw err;
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
      mapped.category_id = row.category_id ? String(row.category_id) : null;
      mapped.collection_id = row.collection_id ? String(row.collection_id) : null;
      if (row.category_id && categoryById.has(String(row.category_id))) {
        mapped.category = categoryById.get(String(row.category_id));
      }
      if (row.collection_id && collectionById.has(String(row.collection_id))) {
        mapped.collectionName = collectionById.get(String(row.collection_id));
      }
      return mapped;
    });

    return { products, categories, collections };
  } catch (err) {
    throw mapSupabaseNetworkError(err, 'loading catalog');
  }
}

/**
 * Delete collection in Supabase (migrate products → General first), then return fresh catalog.
 * @param {string} id
 * @param {string} [reassignToName='General']
 */
export async function persistDeleteCollection(id, reassignToName = '') {
  assertLiveSupabase();
  const targetName = String(reassignToName || '').trim();
  console.info('[catalog-api] deleteCollection', { id, reassignToName: targetName || '(uncategorized)' });

  try {
    if (targetName) {
      const dest = await ensureNamedCollection(targetName);
      await sbDeleteCollection(id, {
        mode: 'reassign',
        reassignTo: dest.id,
        reassignToName: targetName,
      });
    } else {
      // No target name → leave products uncategorized instead of creating "General".
      await sbDeleteCollection(id, { mode: 'null' });
    }
    return fetchAdminCatalog();
  } catch (err) {
    throw mapSupabaseNetworkError(err, 'deleting collection');
  }
}

/**
 * Delete category in Supabase (migrate products → General first), then return fresh catalog.
 * @param {string} id
 * @param {string} [reassignToName='General']
 */
export async function persistDeleteCategory(id, reassignToName = '') {
  assertLiveSupabase();
  const targetName = String(reassignToName || '').trim();
  console.info('[catalog-api] deleteCategory', { id, reassignToName: targetName || '(uncategorized)' });

  try {
    if (targetName) {
      const dest = await ensureNamedCategory(targetName);
      await sbDeleteCategory(id, {
        mode: 'reassign',
        reassignTo: dest.id,
        reassignToName: targetName,
      });
    } else {
      // No target name → leave products uncategorized instead of creating "General".
      await sbDeleteCategory(id, { mode: 'null' });
    }
    return fetchAdminCatalog();
  } catch (err) {
    throw mapSupabaseNetworkError(err, 'deleting category');
  }
}

/**
 * @param {{ id?: string, name: string, description?: string }} input
 * @param {string} [renameFrom]
 */
export async function persistUpsertCollection(input, renameFrom = '') {
  assertLiveSupabase();
  console.info('[catalog-api] upsertCollection', input);
  try {
    await upsertCollectionRow(input, renameFrom);
    return fetchAdminCatalog();
  } catch (err) {
    throw mapSupabaseNetworkError(err, 'saving collection');
  }
}

/**
 * @param {{ id?: string, name: string, description?: string }} input
 * @param {string} [renameFrom]
 */
export async function persistUpsertCategory(input, renameFrom = '') {
  assertLiveSupabase();
  console.info('[catalog-api] upsertCategory', input);
  try {
    await upsertCategoryRow(input, renameFrom);
    return fetchAdminCatalog();
  } catch (err) {
    throw mapSupabaseNetworkError(err, 'saving category');
  }
}

/**
 * @param {object} product — dashboard product shape
 */
export async function persistUpsertProduct(product) {
  assertLiveSupabase();
  console.info('[catalog-api] upsertProduct', product?.id, product?.title || product?.name);
  try {
    await upsertProductRow(product);
    return fetchAdminCatalog();
  } catch (err) {
    throw mapSupabaseNetworkError(err, 'saving product');
  }
}

/**
 * Hard-delete a product row in Supabase and remove its images from R2 / Storage.
 * @param {string} productId
 */
export async function persistDeleteProduct(productId) {
  assertLiveSupabase();
  console.info('[catalog-api] deleteProduct', productId);
  try {
    const result = await deleteProductRow(productId);
    const imageUrls = result?.imageUrls || [];

    if (imageUrls.length) {
      // Supabase Storage cleanup (browser client)
      await deleteSupabaseProductImages(imageUrls).catch((err) => {
        console.warn('[catalog-api] supabase image cleanup skipped:', err?.message || err);
      });

      // Cloudflare R2 cleanup (server API — credentials stay server-side)
      try {
        const res = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'delete', urls: imageUrls }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data?.ok === false) {
          console.warn('[catalog-api] R2 image cleanup failed:', data?.error || res.status);
        } else if (data?.deleted) {
          console.info('[catalog-api] R2 images deleted:', data.deleted);
        }
      } catch (err) {
        console.warn('[catalog-api] R2 image cleanup skipped:', err?.message || err);
      }
    }

    return fetchAdminCatalog();
  } catch (err) {
    throw mapSupabaseNetworkError(err, 'deleting product');
  }
}

/**
 * @returns {boolean}
 */
export function isSupabaseReady() {
  return isSupabaseConfigured();
}
