/**
 * Shared store catalog — admin writes, storefront + POS can read.
 * Persists products + managed collections/categories to localStorage.
 */

export const STORE_CATALOG_KEY = 'shamaadan_store_catalog_v1';

export const DEFAULT_COLLECTIONS = [
  'Candles',
  'Diffusers',
  'Incense',
  'Sprays',
  'Gift Sets',
  'Bakhoor',
  'Accessories',
  'Oils',
];

export const DEFAULT_CATEGORIES = [
  'Candles',
  'Diffusers',
  'Incense',
  'Sprays',
  'Sets',
  'Bakhoor',
  'Accessories',
  'Oils',
  'General',
];

const COLLECTION_GRADIENTS = [
  'linear-gradient(160deg, #2a1f14 0%, #1c1914 60%, #242019 100%)',
  'linear-gradient(200deg, #1a1814 0%, #2a2018 50%, #1c1914 100%)',
  'linear-gradient(140deg, #1e1a10 0%, #3a2a18 40%, #1c1914 100%)',
  'linear-gradient(180deg, #241a10 0%, #1c1914 100%)',
  'linear-gradient(160deg, #1a2018 0%, #1c1914 100%)',
  'linear-gradient(200deg, #201a14 0%, #1c1914 100%)',
];

/**
 * @typedef {object} TaxonomyItem
 * @property {string} id
 * @property {string} name
 * @property {string} [description]
 * @property {string} [gradient]
 */

/**
 * @typedef {object} StoreProduct
 * @property {string} id
 * @property {string} sku
 * @property {string} barcode
 * @property {string} name
 * @property {string} title
 * @property {string} category
 * @property {string} collectionName
 * @property {number} price
 * @property {number} retailPrice
 * @property {number} cost
 * @property {number} costPrice
 * @property {number} stock
 * @property {number} stockQuantity
 * @property {string|null} image
 * @property {string[]} imageUrls
 * @property {boolean} [active]
 */

/**
 * @param {string} value
 */
export function slugify(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06ff]+/gi, '-')
    .replace(/^-|-$/g, '') || 'general';
}

/**
 * @param {object} raw
 * @returns {TaxonomyItem}
 */
export function normalizeTaxonomyItem(raw, index = 0) {
  const name = String(raw?.name ?? raw ?? '').trim();
  return {
    id: String(raw?.id || slugify(name) || `item-${index}`),
    name: name || 'Untitled',
    description: raw?.description ? String(raw.description) : '',
    gradient: raw?.gradient || COLLECTION_GRADIENTS[index % COLLECTION_GRADIENTS.length],
  };
}

/**
 * Normalize any product shape into the storefront/admin shared schema.
 * Supports unified Supabase columns: stock_quantity, retail_price, wholesale_cost, min_stock_alert.
 * @param {object} raw
 * @returns {StoreProduct}
 */
export function normalizeStoreProduct(raw) {
  const imageUrls = Array.isArray(raw.imageUrls)
    ? raw.imageUrls.filter(Boolean)
    : Array.isArray(raw.image_urls)
      ? raw.image_urls.filter(Boolean)
      : raw.image_url
        ? [raw.image_url]
        : raw.image
          ? [raw.image]
          : [];

  const title = raw.title ?? raw.name ?? 'Untitled';
  const collectionName = String(raw.collectionName ?? raw.category ?? 'General').trim() || 'General';
  const category = String(raw.category ?? raw.collectionName ?? 'General').trim() || 'General';
  const barcode = String(raw.barcode ?? raw.sku ?? '');
  const retailPrice = Number(raw.retailPrice ?? raw.retail_price ?? raw.price ?? 0);
  const costPrice = Number(raw.costPrice ?? raw.wholesale_cost ?? raw.cost ?? 0);
  const stockQuantity = Number(raw.stockQuantity ?? raw.stock_quantity ?? raw.stock ?? 0);
  const minStockAlert = Number(raw.minStockAlert ?? raw.min_stock_alert ?? 5);
  const isActive = raw.is_active !== false && raw.active !== false;

  return {
    id: String(raw.id || `p-${Date.now().toString(36)}`),
    sku: barcode || String(raw.sku ?? ''),
    barcode,
    name: title,
    title,
    description: raw.description ? String(raw.description) : '',
    category,
    collectionName,
    price: retailPrice,
    retailPrice,
    cost: costPrice,
    costPrice,
    stock: stockQuantity,
    stockQuantity,
    minStockAlert,
    min_stock_alert: minStockAlert,
    image: imageUrls[0] ?? null,
    imageUrls,
    active: isActive,
    is_active: isActive,
  };
}

/**
 * Merge managed taxonomy with names found on products.
 * @param {TaxonomyItem[]} managed
 * @param {string[]} fromProducts
 * @param {string[]} defaults
 */
export function mergeTaxonomy(managed = [], fromProducts = [], defaults = []) {
  const map = new Map();

  [...defaults, ...fromProducts].forEach((name, index) => {
    const item = normalizeTaxonomyItem({ name }, index);
    if (!map.has(item.name.toLowerCase())) map.set(item.name.toLowerCase(), item);
  });

  managed.forEach((raw, index) => {
    const item = normalizeTaxonomyItem(raw, index);
    map.set(item.name.toLowerCase(), item);
  });

  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * @param {StoreProduct[]} products
 * @param {TaxonomyItem[]} [managedCollections]
 */
export function buildCollectionsFromProducts(products, managedCollections = []) {
  const counts = new Map();
  for (const product of products) {
    const name = product.collectionName || product.category || 'General';
    counts.set(name, (counts.get(name) || 0) + 1);
  }

  const namesFromProducts = [...counts.keys()];
  const merged = mergeTaxonomy(managedCollections, namesFromProducts, DEFAULT_COLLECTIONS);

  return merged.map((item, index) => ({
    ...item,
    gradient: item.gradient || COLLECTION_GRADIENTS[index % COLLECTION_GRADIENTS.length],
    count: counts.get(item.name) || 0,
  }));
}

/**
 * @param {StoreProduct[]} products
 * @param {TaxonomyItem[]} [managedCategories]
 */
export function buildCategoriesFromProducts(products, managedCategories = []) {
  const counts = new Map();
  for (const product of products) {
    const name = product.category || 'General';
    counts.set(name, (counts.get(name) || 0) + 1);
  }

  const namesFromProducts = [...counts.keys()];
  const merged = mergeTaxonomy(managedCategories, namesFromProducts, DEFAULT_CATEGORIES);

  return merged.map((item) => ({
    ...item,
    count: counts.get(item.name) || 0,
  }));
}

/**
 * @param {{ products: StoreProduct[], collections?: TaxonomyItem[], categories?: TaxonomyItem[] }} payload
 */
export function saveStoreCatalog(payload) {
  if (typeof localStorage === 'undefined') return;

  const products = (payload.products || []).map(normalizeStoreProduct).filter((p) => p.active !== false);
  const collections = (payload.collections || []).map(normalizeTaxonomyItem);
  const categories = (payload.categories || []).map(normalizeTaxonomyItem);

  localStorage.setItem(STORE_CATALOG_KEY, JSON.stringify({
    products,
    collections,
    categories,
    updatedAt: new Date().toISOString(),
  }));
}

/**
 * @returns {{ products: StoreProduct[], collections: TaxonomyItem[], categories: TaxonomyItem[] } | null}
 */
export function loadStoreCatalog() {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORE_CATALOG_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!Array.isArray(data.products) || !data.products.length) {
      // Still allow taxonomy-only persistence
      if (!data.collections?.length && !data.categories?.length) return null;
    }

    return {
      products: Array.isArray(data.products) ? data.products.map(normalizeStoreProduct) : [],
      collections: Array.isArray(data.collections) ? data.collections.map(normalizeTaxonomyItem) : [],
      categories: Array.isArray(data.categories) ? data.categories.map(normalizeTaxonomyItem) : [],
    };
  } catch {
    return null;
  }
}
