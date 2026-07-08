/**
 * Central Dashboard — unified accounting state & inventory ledger.
 * Framework-free state engine for Online Storefront + In-Store POS channels.
 */
import { createMockTransactions } from './shared/mock-transactions.js';
import { cloneCatalog, MOCK_PRODUCTS } from './shared/mock-products.js';
import { formatCurrency, formatCount } from './shared/format.js';

const STORAGE_KEY = 'shamaadan_dashboard_v1';

/** @typedef {'online' | 'pos'} SalesChannel */

/**
 * @typedef {object} ProductRecord
 * @property {string} id
 * @property {string} title
 * @property {string} collectionName
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
 */

/**
 * Normalize raw catalog row into dashboard product schema.
 * @param {object} raw
 * @returns {ProductRecord}
 */
export function normalizeProduct(raw) {
  const imageUrls = Array.isArray(raw.imageUrls)
    ? raw.imageUrls
    : raw.image
      ? [raw.image]
      : [];

  return {
    id: String(raw.id),
    title: raw.title ?? raw.name ?? 'Untitled',
    collectionName: raw.collectionName ?? raw.category ?? 'General',
    costPrice: Number(raw.costPrice ?? raw.cost ?? 0),
    retailPrice: Number(raw.retailPrice ?? raw.price ?? 0),
    stockQuantity: Number(raw.stockQuantity ?? raw.stock ?? 0),
    barcode: raw.barcode ?? raw.sku ?? '',
    imageUrls,
  };
}

/**
 * Convert dashboard product to POS-compatible catalog row.
 * @param {ProductRecord} product
 */
export function toPosCatalogRow(product) {
  return {
    id: product.id,
    sku: product.barcode,
    name: product.title,
    category: product.collectionName,
    price: product.retailPrice,
    cost: product.costPrice,
    stock: product.stockQuantity,
    image: product.imageUrls[0] ?? null,
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
  };
}

/**
 * @param {object} [options]
 * @param {boolean} [options.persist=true]
 * @param {boolean} [options.seedMock=true]
 */
export function createDashboardState(options = {}) {
  const { persist = true, seedMock = true } = options;

  /** @type {ProductRecord[]} */
  let products = cloneCatalog(MOCK_PRODUCTS).map(normalizeProduct);

  /** @type {Transaction[]} */
  let transactions = [];

  const listeners = new Set();
  let streamTimer = null;

  function loadPersisted() {
    if (!persist || typeof localStorage === 'undefined') return false;

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (data.products?.length) products = data.products.map(normalizeProduct);
      if (data.transactions?.length) transactions = data.transactions;
      return true;
    } catch {
      return false;
    }
  }

  function save() {
    if (!persist || typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ products, transactions }));
  }

  function notify() {
    const snapshot = getSnapshot();
    listeners.forEach((fn) => fn(snapshot));
  }

  function getSnapshot() {
    return {
      products: products.map((p) => ({ ...p, imageUrls: [...p.imageUrls] })),
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
   * @param {{ revenue: number, cost: number, profit: number, units: number, lines?: TransactionLine[] }} sale
   */
  function recordPosSale(sale) {
    if (sale.lines?.length) {
      return processTransaction({ channel: 'pos', lines: sale.lines, paymentMethod: 'terminal' });
    }

    return processTransaction({
      channel: 'pos',
      paymentMethod: 'terminal',
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
   * @param {string} id
   */
  function deleteProduct(id) {
    products = products.filter((p) => p.id !== id);
    save();
    notify();
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
    transactions = createMockTransactions().map((tx) => buildTransaction(tx));
    save();
    notify();
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
  }

  return {
    getSnapshot,
    subscribe,
    processTransaction,
    recordPosSale,
    upsertProduct,
    deleteProduct,
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
