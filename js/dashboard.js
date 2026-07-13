/**
 * Central Dashboard — unified accounting state & inventory ledger.
 * Framework-free state engine for Online Storefront + In-Store POS channels.
 */
import { createMockTransactions } from './shared/mock-transactions.js';
import { cloneCatalog, MOCK_PRODUCTS } from './shared/mock-products.js';
import { formatCurrency, formatCount } from './shared/format.js';
import {
  loadStoreCatalog,
  saveStoreCatalog,
  normalizeStoreProduct,
  normalizeTaxonomyItem,
  buildCollectionsFromProducts,
  buildCategoriesFromProducts,
  DEFAULT_COLLECTIONS,
  DEFAULT_CATEGORIES,
} from './shared/catalog-store.js';
import { isLiveDbId } from './shared/ids.js';

const STORAGE_KEY = 'shamaadan_dashboard_v1';

/** @typedef {'online' | 'pos'} SalesChannel */

/**
 * @typedef {object} ProductRecord
 * @property {string} id
 * @property {string} title
 * @property {string} collectionName
 * @property {string} [category]
 * @property {number} costPrice
 * @property {number} retailPrice
 * @property {number} stockQuantity
 * @property {string} barcode
 * @property {string[]} imageUrls
 */

/**
 * @typedef {object} ChannelLedger
 * @property {number} sellNumber
 * @property {number} grossRevenue
 * @property {number} assetCost
 * @property {number} netProfit
 */

/**
 * @typedef {object} TransactionLine
 * @property {string} productId
 * @property {string} title
 * @property {number} quantity
 * @property {number} unitPrice
 * @property {number} unit_cost_at_sale
 */

/**
 * @typedef {object} Transaction
 * @property {string} id
 * @property {SalesChannel} channel
 * @property {string} timestamp
 * @property {TransactionLine[]} lines
 * @property {number} grossRevenue
 * @property {number} assetCost
 * @property {number} netProfit
 * @property {string} [paymentMethod]
 * @property {string} [orderRef]
 * @property {string} [staffUserId]
 * @property {string} [staffName]
 */

/**
 * Normalize raw catalog row into dashboard product schema.
 * @param {object} raw
 * @returns {ProductRecord}
 */
export function normalizeProduct(raw) {
  return normalizeStoreProduct(raw);
}

/**
 * Convert dashboard product to POS-compatible catalog row.
 * @param {ProductRecord} product
 */
export function toPosCatalogRow(product) {
  return {
    id: product.id,
    sku: product.barcode,
    barcode: product.barcode ?? product.sku ?? '',
    name: product.title,
    category: product.category || product.collectionName,
    price: product.retailPrice,
    cost: product.costPrice,
    stock: product.stockQuantity,
    image: product.imageUrls?.[0] ?? null,
  };
}

/**
 * @param {TransactionLine[]} lines
 */
export function summarizeLines(lines) {
  let grossRevenue = 0;
  let assetCost = 0;

  for (const line of lines) {
    const qty = line.quantity;
    grossRevenue += line.unitPrice * qty;
    assetCost += line.unit_cost_at_sale * qty;
  }

  return {
    grossRevenue,
    assetCost,
    netProfit: grossRevenue - assetCost,
  };
}

/**
 * @param {Transaction[]} transactions
 * @param {SalesChannel} channel
 * @returns {ChannelLedger}
 */
export function computeChannelLedger(transactions, channel) {
  const filtered = transactions.filter((tx) => tx.channel === channel);

  return filtered.reduce(
    (acc, tx) => ({
      sellNumber: acc.sellNumber + 1,
      grossRevenue: acc.grossRevenue + tx.grossRevenue,
      assetCost: acc.assetCost + tx.assetCost,
      netProfit: acc.netProfit + tx.netProfit,
    }),
    { sellNumber: 0, grossRevenue: 0, assetCost: 0, netProfit: 0 },
  );
}

/**
 * @param {Partial<Transaction> & { channel: SalesChannel, lines: TransactionLine[] }} input
 * @returns {Transaction}
 */
export function buildTransaction(input) {
  const totals = summarizeLines(input.lines);

  return {
    id: input.id ?? `tx-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    channel: input.channel,
    timestamp: input.timestamp ?? new Date().toISOString(),
    lines: input.lines,
    grossRevenue: totals.grossRevenue,
    assetCost: totals.assetCost,
    netProfit: totals.netProfit,
    paymentMethod: input.paymentMethod,
    orderRef: input.orderRef,
    staffUserId: input.staffUserId,
    staffName: input.staffName,
  };
}

/**
 * @param {object} [options]
 * @param {boolean} [options.persist=true]
 * @param {boolean} [options.seedMock=true]
 */
export function createDashboardState(options = {}) {
  const supabaseReady = typeof window !== 'undefined'
    && Boolean(window.__ENV__?.VITE_SUPABASE_URL && window.__ENV__?.VITE_SUPABASE_ANON_KEY);
  const { persist = true, seedMock = !supabaseReady } = options;

  /** @type {ProductRecord[]} */
  let products = seedMock ? cloneCatalog(MOCK_PRODUCTS).map(normalizeProduct) : [];

  /** @type {import('./shared/catalog-store.js').TaxonomyItem[]} */
  let collections = seedMock
    ? DEFAULT_COLLECTIONS.map((name, i) => normalizeTaxonomyItem({ name }, i))
    : [];

  /** @type {import('./shared/catalog-store.js').TaxonomyItem[]} */
  let categories = seedMock
    ? DEFAULT_CATEGORIES.map((name, i) => normalizeTaxonomyItem({ name }, i))
    : [];

  /** @type {Transaction[]} */
  let transactions = [];

  const listeners = new Set();
  let streamTimer = null;

  function syncStoreCatalog() {
    saveStoreCatalog({ products, collections, categories });
  }

  function loadPersisted() {
    if (!persist || typeof localStorage === 'undefined') return false;

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        const storeCatalog = loadStoreCatalog();
        if (storeCatalog) {
          if (storeCatalog.products?.length) {
            products = storeCatalog.products
              .map(normalizeProduct)
              .filter((p) => !supabaseReady || isLiveDbId(p.id));
          }
          if (storeCatalog.collections?.length) {
            collections = storeCatalog.collections
              .map(normalizeTaxonomyItem)
              .filter((c) => !supabaseReady || isLiveDbId(c.id));
          }
          if (storeCatalog.categories?.length) {
            categories = storeCatalog.categories
              .map(normalizeTaxonomyItem)
              .filter((c) => !supabaseReady || isLiveDbId(c.id));
          }
          return Boolean(products.length || collections.length || categories.length);
        }
        return false;
      }
      const data = JSON.parse(raw);
      if (data.products?.length) {
        products = data.products
          .map(normalizeProduct)
          .filter((p) => !supabaseReady || isLiveDbId(p.id));
      }
      if (data.collections?.length) {
        collections = data.collections
          .map(normalizeTaxonomyItem)
          .filter((c) => !supabaseReady || isLiveDbId(c.id));
      }
      if (data.categories?.length) {
        categories = data.categories
          .map(normalizeTaxonomyItem)
          .filter((c) => !supabaseReady || isLiveDbId(c.id));
      }
      if (data.transactions?.length) transactions = data.transactions;
      syncStoreCatalog();
      return Boolean(products.length || collections.length || categories.length);
    } catch {
      return false;
    }
  }

  function save() {
    if (!persist || typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      products,
      collections,
      categories,
      transactions,
    }));
    syncStoreCatalog();
  }

  function notify() {
    const snapshot = getSnapshot();
    listeners.forEach((fn) => fn(snapshot));
  }

  function getSnapshot() {
    const liveCollections = collections.filter((c) => !supabaseReady || isLiveDbId(c.id));
    const liveCategories = categories.filter((c) => !supabaseReady || isLiveDbId(c.id));

    return {
      products: products.map((p) => ({ ...p, imageUrls: [...(p.imageUrls || [])] })),
      // Prefer live managed taxonomy only — never inject DEFAULT_* mock names into the UI.
      collections: supabaseReady
        ? liveCollections.map((c) => ({
          ...c,
          count: products.filter((p) => p.collectionName === c.name).length,
        }))
        : buildCollectionsFromProducts(products, collections),
      categories: supabaseReady
        ? liveCategories.map((c) => ({
          ...c,
          count: products.filter((p) => p.category === c.name).length,
        }))
        : buildCategoriesFromProducts(products, categories),
      managedCollections: liveCollections.map((c) => ({ ...c })),
      managedCategories: liveCategories.map((c) => ({ ...c })),
      transactions: [...transactions],
      ledgers: {
        online: computeChannelLedger(transactions, 'online'),
        pos: computeChannelLedger(transactions, 'pos'),
      },
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Process a transaction — looks up unit_cost_at_sale from product ledger when missing.
   * @param {Partial<Transaction> & { channel: SalesChannel, lines: Array<Partial<TransactionLine> & { productId: string, quantity: number }> }} input
   */
  function processTransaction(input) {
    const lines = input.lines.map((line) => {
      const product = products.find((p) => p.id === line.productId);
      const unitPrice = Number(line.unitPrice ?? product?.retailPrice ?? 0);
      const unit_cost_at_sale = Number(
        line.unit_cost_at_sale ?? product?.costPrice ?? 0,
      );

      if (product && line.quantity > 0) {
        product.stockQuantity = Math.max(0, product.stockQuantity - line.quantity);
      }

      return {
        productId: line.productId,
        title: line.title ?? product?.title ?? 'Unknown item',
        quantity: line.quantity,
        unitPrice,
        unit_cost_at_sale,
      };
    });

    const tx = buildTransaction({ ...input, lines });
    transactions.unshift(tx);
    save();
    notify();
    return tx;
  }

  /**
   * Record POS checkout summary as a single transaction.
   * @param {{ revenue: number, cost: number, profit: number, units: number, lines?: TransactionLine[], staffUserId?: string, staffName?: string }} sale
   */
  function recordPosSale(sale) {
    const staff = {
      staffUserId: sale.staffUserId,
      staffName: sale.staffName,
    };

    if (sale.lines?.length) {
      return processTransaction({
        channel: 'pos',
        lines: sale.lines,
        paymentMethod: 'terminal',
        ...staff,
      });
    }

    return processTransaction({
      channel: 'pos',
      paymentMethod: 'terminal',
      ...staff,
      lines: [{
        productId: 'pos-aggregate',
        title: 'POS Register Sale',
        quantity: sale.units || 1,
        unitPrice: sale.units ? sale.revenue / sale.units : sale.revenue,
        unit_cost_at_sale: sale.units ? sale.cost / sale.units : sale.cost,
      }],
    });
  }

  /**
   * @param {Partial<ProductRecord> & { title: string }} input
   */
  function upsertProduct(input) {
    const normalized = normalizeProduct(input);
    const idx = products.findIndex((p) => p.id === normalized.id);

    if (idx >= 0) {
      products[idx] = normalized;
    } else {
      products.push(normalized);
    }

    save();
    notify();
    return normalized;
  }

  /**
   * @param {string} barcode
   * @returns {ProductRecord | undefined}
   */
  function findByBarcode(barcode) {
    const code = barcode.trim().toLowerCase();
    return products.find((p) => p.barcode.toLowerCase() === code);
  }

  function subscribe(fn) {
    listeners.add(fn);
    fn(getSnapshot());
    return () => listeners.delete(fn);
  }

  function seedFromMock() {
    products = cloneCatalog(MOCK_PRODUCTS).map(normalizeProduct);
    collections = DEFAULT_COLLECTIONS.map((name, i) => normalizeTaxonomyItem({ name }, i));
    categories = DEFAULT_CATEGORIES.map((name, i) => normalizeTaxonomyItem({ name }, i));
    transactions = createMockTransactions().map((tx) => buildTransaction(tx));
    save();
    notify();
  }

  function getCollections() {
    return buildCollectionsFromProducts(products, collections);
  }

  function getCategories() {
    return buildCategoriesFromProducts(products, categories);
  }

  /**
   * @param {Array} nextProducts
   */
  function replaceProducts(nextProducts) {
    products = nextProducts.map(normalizeProduct);
    save();
    notify();
    return products;
  }

  /**
   * Replace local catalog from a live Supabase fetch.
   * @param {{ products?: Array, collections?: Array, categories?: Array }} catalog
   */
  function hydrateCatalog(catalog = {}) {
    if (Array.isArray(catalog.products)) {
      products = catalog.products.map(normalizeProduct).filter((p) => isLiveDbId(p.id));
    }
    if (Array.isArray(catalog.collections)) {
      collections = catalog.collections.map(normalizeTaxonomyItem).filter((c) => isLiveDbId(c.id));
    }
    if (Array.isArray(catalog.categories)) {
      categories = catalog.categories.map(normalizeTaxonomyItem).filter((c) => isLiveDbId(c.id));
    }
    save();
    notify();
    return getSnapshot();
  }

  /**
   * Delete a product in Supabase, then re-fetch catalog.
   * @param {string} id
   * @returns {Promise<{ ok: boolean, error?: string }>}
   */
  async function deleteProduct(id) {
    try {
      if (!isLiveDbId(id)) {
        return { ok: false, error: 'Product id must be a live Supabase UUID.' };
      }
      const { persistDeleteProduct } = await import('./admin/catalog-api.js');
      const catalog = await persistDeleteProduct(id);
      hydrateCatalog(catalog);
      return { ok: true };
    } catch (err) {
      console.error('[dashboard] deleteProduct failed:', err);
      return {
        ok: false,
        error: err?.message || 'Failed to delete product.',
      };
    }
  }

  /**
   * @param {{ id?: string, name: string, description?: string, gradient?: string }} input
   * @param {string} [renameFrom]
   */
  function upsertCollection(input, renameFrom = '') {
    const item = normalizeTaxonomyItem(input);
    const oldName = renameFrom || collections.find((c) => c.id === item.id)?.name || '';
    const idx = collections.findIndex((c) => c.id === item.id || c.name.toLowerCase() === item.name.toLowerCase() || (oldName && c.name === oldName));

    if (idx >= 0) {
      const previous = collections[idx].name;
      collections[idx] = item;
      if (previous && previous !== item.name) {
        products = products.map((p) => (
          p.collectionName === previous
            ? { ...p, collectionName: item.name }
            : p
        ));
      }
    } else {
      collections.push(item);
    }

    save();
    notify();
    return item;
  }

  /**
   * Delete a collection in Supabase (migrate products → General), then re-fetch catalog.
   * @param {string} idOrName
   * @param {{ reassignTo?: string | null, mode?: 'reassign' | 'null' | 'block' }} [options]
   * @returns {Promise<{ ok: boolean, error?: string, reassigned?: number }>}
   */
  async function deleteCollection(idOrName, options = {}) {
    try {
      const target = collections.find((c) => c.id === idOrName || c.name === idOrName);
      if (!target) {
        return { ok: false, error: 'Collection not found.' };
      }
      if (!isLiveDbId(target.id)) {
        return { ok: false, error: 'Collection id must be a live Supabase UUID.' };
      }

      const linked = products.filter((p) => p.collectionName === target.name);
      const mode = options.mode || (options.reassignTo === null ? 'null' : 'reassign');

      if (linked.length && mode === 'block') {
        return {
          ok: false,
          error: 'Cannot delete this collection because products are still assigned to it. Please reassign the products first.',
        };
      }

      const reassignTo = String(options.reassignTo || '').trim();
      const { persistDeleteCollection } = await import('./admin/catalog-api.js');
      const catalog = await persistDeleteCollection(target.id, mode === 'null' ? '' : reassignTo);
      hydrateCatalog(catalog);
      return { ok: true, reassigned: linked.length };
    } catch (err) {
      console.error('[dashboard] deleteCollection failed:', err);
      return {
        ok: false,
        error: err?.message || 'Failed to delete collection.',
      };
    }
  }

  /**
   * @param {{ id?: string, name: string, description?: string }} input
   * @param {string} [renameFrom]
   */
  function upsertCategory(input, renameFrom = '') {
    const item = normalizeTaxonomyItem(input);
    const oldName = renameFrom || categories.find((c) => c.id === item.id)?.name || '';
    const idx = categories.findIndex((c) => c.id === item.id || c.name.toLowerCase() === item.name.toLowerCase() || (oldName && c.name === oldName));

    if (idx >= 0) {
      const previous = categories[idx].name;
      categories[idx] = item;
      if (previous && previous !== item.name) {
        products = products.map((p) => (
          p.category === previous
            ? { ...p, category: item.name }
            : p
        ));
      }
    } else {
      categories.push(item);
    }

    save();
    notify();
    return item;
  }

  /**
   * Delete a category in Supabase (migrate products → General), then re-fetch catalog.
   * @param {string} idOrName
   * @param {{ reassignTo?: string | null, mode?: 'reassign' | 'null' | 'block' }} [options]
   * @returns {Promise<{ ok: boolean, error?: string, reassigned?: number }>}
   */
  async function deleteCategory(idOrName, options = {}) {
    try {
      const target = categories.find((c) => c.id === idOrName || c.name === idOrName);
      if (!target) {
        return { ok: false, error: 'Category not found.' };
      }
      if (!isLiveDbId(target.id)) {
        return { ok: false, error: 'Category id must be a live Supabase UUID.' };
      }

      const linked = products.filter((p) => p.category === target.name);
      const mode = options.mode || (options.reassignTo === null ? 'null' : 'reassign');

      if (linked.length && mode === 'block') {
        return {
          ok: false,
          error: 'Cannot delete this category because products are still assigned to it. Please reassign the products first.',
        };
      }

      const reassignTo = String(options.reassignTo || '').trim();
      const { persistDeleteCategory } = await import('./admin/catalog-api.js');
      const catalog = await persistDeleteCategory(target.id, mode === 'null' ? '' : reassignTo);
      hydrateCatalog(catalog);
      return { ok: true, reassigned: linked.length };
    } catch (err) {
      console.error('[dashboard] deleteCategory failed:', err);
      return {
        ok: false,
        error: err?.message || 'Failed to delete category.',
      };
    }
  }

  /**
   * Simulate incoming online orders on an interval.
   * @param {number} [intervalMs=45000]
   */
  function startTransactionStream(intervalMs = 45_000) {
    stopTransactionStream();

    streamTimer = setInterval(() => {
      const inStock = products.filter((p) => p.stockQuantity > 0);
      if (!inStock.length) return;

      const product = inStock[Math.floor(Math.random() * inStock.length)];
      const qty = Math.min(product.stockQuantity, Math.random() > 0.7 ? 2 : 1);

      processTransaction({
        channel: 'online',
        paymentMethod: Math.random() > 0.5 ? 'upay' : 'cad',
        orderRef: `SHM-LIVE-${Date.now().toString(36).toUpperCase()}`,
        lines: [{
          productId: product.id,
          title: product.title,
          quantity: qty,
          unitPrice: product.retailPrice,
          unit_cost_at_sale: product.costPrice,
        }],
      });
    }, intervalMs);
  }

  function stopTransactionStream() {
    if (streamTimer) {
      clearInterval(streamTimer);
      streamTimer = null;
    }
  }

  const hadPersisted = loadPersisted();
  if (!hadPersisted && seedMock) {
    seedFromMock();
  } else if (hadPersisted) {
    syncStoreCatalog();
  }

  return {
    getSnapshot,
    subscribe,
    processTransaction,
    recordPosSale,
    upsertProduct,
    deleteProduct,
    replaceProducts,
    hydrateCatalog,
    getCollections,
    getCategories,
    upsertCollection,
    deleteCollection,
    upsertCategory,
    deleteCategory,
    findByBarcode,
    seedFromMock,
    startTransactionStream,
    stopTransactionStream,
    normalizeProduct,
    computeChannelLedger,
    summarizeLines,
    buildTransaction,
  };
}

/** Singleton for cross-app sync (admin ↔ POS). */
let sharedState = null;

export function getSharedDashboardState() {
  if (!sharedState) sharedState = createDashboardState();
  return sharedState;
}

/**
 * Ledger metric definitions for UI rendering.
 */
export const LEDGER_METRICS = [
  { key: 'sellNumber', label: 'Sell Number', format: formatCount },
  { key: 'grossRevenue', label: 'Gross Revenue', format: (v) => formatCurrency(v, 'LYD') },
  { key: 'assetCost', label: 'Asset Cost', format: (v) => formatCurrency(v, 'LYD'), tone: 'cost' },
  { key: 'netProfit', label: 'Net Profit', format: (v) => formatCurrency(v, 'LYD'), tone: 'profit' },
];
