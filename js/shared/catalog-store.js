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
  /** Strip raw JSON accidentally stored in plain-text fields. */
  const cleanField = (val, key) => {
    const s = String(val || '').trim();
    if (!s) return '';
    if (s.startsWith('{') || s.startsWith('[') || s.startsWith('"')) {
      try {
        const parsed = JSON.parse(s);
        if (typeof parsed === 'string') return parsed;
        if (key && typeof parsed === 'object' && parsed !== null) return String(parsed[key] || '').trim();
        return '';
      } catch { /* not valid JSON as a whole */ }
    }
    // Detect JSON key-value fragments like "retailPrice":30 or "color":"blue"
    if (/^"[^"]+"\s*:/.test(s)) return '';
    return s;
  };

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
    description: cleanField(raw.description, 'description'),
    category,
    collectionName,
    category_id: raw.category_id ?? raw.categoryId ?? null,
    collection_id: raw.collection_id ?? raw.collectionId ?? null,
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
    showOnWebsite: raw.showOnWebsite !== false && raw.show_on_website !== false,
    show_on_website: raw.showOnWebsite !== false && raw.show_on_website !== false,
    color: cleanField(raw.color, 'color'),
    scent: cleanField(raw.scent),
    createdAt: raw.createdAt || raw.created_at || null,
    updatedAt: raw.updatedAt || raw.updated_at || null,
    created_at: raw.createdAt || raw.created_at || null,
    updated_at: raw.updatedAt || raw.updated_at || null,
  };
}

/**
 * Color · specs label for a product SKU.
 * @param {{ color?: string, scent?: string }} product
 */
export function formatProductSpecs(product) {
  return [product?.color, product?.scent]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(' · ');
}

/**
 * @param {string} name
 */
export function productGroupKey(name) {
  return String(name || '').trim().toLowerCase();
}

/**
 * Group sellable SKUs that share the same product name (case-insensitive).
 * @param {Array<object>} products
 * @param {Record<string, string>|Map<string, string>} [preferredIds] — group key → selected product id
 * @returns {Array<{ key: string, name: string, variants: object[], selected: object }>}
 */
export function groupProductsByName(products = [], preferredIds = {}) {
  /** @type {Map<string, { key: string, name: string, variants: object[] }>} */
  const map = new Map();

  for (const product of products) {
    const name = String(product?.title || product?.name || 'Untitled').trim() || 'Untitled';
    const key = productGroupKey(name);
    if (!map.has(key)) {
      map.set(key, { key, name, variants: [] });
    }
    map.get(key).variants.push(product);
  }

  const getPreferred = (key) => {
    if (preferredIds instanceof Map) return preferredIds.get(key);
    return preferredIds?.[key];
  };

  return [...map.values()].map((group) => {
    const preferredId = getPreferred(group.key);
    let selected = preferredId
      ? group.variants.find((v) => String(v.id) === String(preferredId))
      : null;
    if (!selected) {
      selected = group.variants.find((v) => Number(v.stockQuantity ?? v.stock ?? 0) > 0)
        || group.variants[0];
    }
    return { ...group, selected };
  });
}

/**
 * Whether a name-group should show selectable spec chips.
 * @param {{ variants: object[] }} group
 */
export function groupShowsSpecChips(group) {
  if (!group?.variants?.length) return false;
  if (group.variants.length > 1) return true;
  return group.variants.some((v) => Boolean(formatProductSpecs(v)));
}

/**
 * Chip label for a variant (specs, else barcode, else Option N).
 * Optionally appends price when variants in the group have different prices.
 * @param {object} product
 * @param {number} [index]
 * @param {{ showPrice?: boolean, formatPrice?: (n: number) => string }} [opts]
 */
export function variantChipLabel(product, index = 0, opts = {}) {
  const specs = formatProductSpecs(product);
  let label = specs;
  if (!label) {
    const barcode = String(product?.barcode || product?.sku || '').trim();
    label = barcode || `Option ${index + 1}`;
  }
  if (opts.showPrice && typeof opts.formatPrice === 'function') {
    const price = Number(product?.retailPrice ?? product?.price ?? 0);
    label = `${label} · ${opts.formatPrice(price)}`;
  }
  return label;
}

/**
 * True when variants do not all share the same price.
 * @param {object[]} variants
 */
export function variantsHaveDifferentPrices(variants = []) {
  if (variants.length < 2) return false;
  const prices = variants.map((v) => Number(v?.retailPrice ?? v?.price ?? 0).toFixed(2));
  return new Set(prices).size > 1;
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
