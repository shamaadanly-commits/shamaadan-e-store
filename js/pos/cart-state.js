/**
 * POS checkout ticket state management.
 * Tracks line items, computes totals, and mutates mock inventory.
 */

/**
 * @typedef {object} CatalogProduct
 * @property {string} id
 * @property {string} sku
 * @property {string} [barcode]
 * @property {string} name
 * @property {string} category
 * @property {number} price
 * @property {number} cost
 * @property {number} stock
 */

/**
 * @typedef {object} LineItem
 * @property {string} productId
 * @property {string} name
 * @property {number} unitPrice
 * @property {number} unitCost
 * @property {number} quantity
 */

export function createCartState(initialCatalog) {
  /** @type {Map<string, CatalogProduct>} */
  const inventory = new Map(initialCatalog.map((p) => [p.id, { ...p }]));

  /** @type {Map<string, LineItem>} */
  const lines = new Map();

  /** Fixed discount in LYD (not percent). */
  let discountAmount = 0;

  const listeners = new Set();

  function notify() {
    const snapshot = getSnapshot();
    listeners.forEach((fn) => fn(snapshot));
  }

  function getSnapshot() {
    const items = Array.from(lines.values());
    const subtotal = items.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
    const totalCost = items.reduce((sum, line) => sum + line.unitCost * line.quantity, 0);
    const itemCount = items.reduce((sum, line) => sum + line.quantity, 0);
    const discount = Math.min(Math.max(0, Number(discountAmount) || 0), subtotal);
    const total = Math.max(0, subtotal - discount);

    return {
      items,
      itemCount,
      subtotal,
      discount,
      total,
      totalCost,
      grossProfit: total - totalCost,
      catalog: Array.from(inventory.values()),
    };
  }

  /**
   * Set a fixed LYD discount (clamped to the current subtotal).
   * @param {number} amount
   */
  function setDiscount(amount) {
    const raw = Number(amount);
    discountAmount = Number.isFinite(raw) && raw > 0 ? raw : 0;
    notify();
  }

  /**
   * Add one unit of a product to the active ticket.
   * @param {string} productId
   * @returns {boolean} false if out of stock
   */
  function addItem(productId) {
    const product = inventory.get(productId);
    if (!product || product.stock <= 0) return false;

    product.stock -= 1;

    const existing = lines.get(productId);
    if (existing) {
      existing.quantity += 1;
    } else {
      lines.set(productId, {
        productId,
        name: product.name,
        unitPrice: product.price,
        unitCost: product.cost,
        quantity: 1,
      });
    }

    notify();
    return true;
  }

  /**
   * Adjust quantity for a line item. Removes line if qty reaches 0 and restores stock.
   * @param {string} productId
   * @param {number} delta
   */
  function adjustQuantity(productId, delta) {
    const line = lines.get(productId);
    const product = inventory.get(productId);
    if (!line || !product) return;

    if (delta > 0) {
      if (product.stock < delta) return;
      product.stock -= delta;
      line.quantity += delta;
    } else {
      const removeQty = Math.min(line.quantity, Math.abs(delta));
      product.stock += removeQty;
      line.quantity -= removeQty;
      if (line.quantity <= 0) lines.delete(productId);
    }

    notify();
  }

  function clear(opts = {}) {
    const restoreStock = opts.restoreStock !== false;
    if (restoreStock) {
      for (const line of lines.values()) {
        const product = inventory.get(line.productId);
        if (product) product.stock += line.quantity;
      }
    }
    lines.clear();
    discountAmount = 0;
    notify();
  }

  /**
   * Rebuild the whole catalog from fresh server rows — picks up new products,
   * removed products, and stock/price changes. Only runs when the ticket is
   * empty so an in-progress sale is never disturbed.
   * @param {Array<CatalogProduct>} rows
   * @returns {boolean} true if the catalog was replaced
   */
  function resetCatalog(rows) {
    if (lines.size) return false; // never disturb an active ticket
    inventory.clear();
    for (const p of rows || []) {
      if (p && p.id) inventory.set(p.id, { ...p });
    }
    notify();
    return true;
  }

  /**
   * Sync local catalog stock from server rows (after park / void / charge).
   * @param {Array<{ id: string, stock?: number, stockQuantity?: number }>} rows
   */
  function syncCatalogStock(rows) {
    for (const row of rows || []) {
      const product = inventory.get(row.id);
      if (!product) continue;
      const next = Number(row.stockQuantity ?? row.stock);
      if (Number.isFinite(next)) product.stock = Math.max(0, next);
    }
    notify();
  }

  /**
   * Replace the ticket with saved open-ticket lines (restores previous stock first).
   * @param {Array<{ productId: string, name?: string, unitPrice: number, unitCost?: number, quantity: number }>} nextLines
   * @returns {{ ok: boolean, missing?: string[] }}
   */
  function loadTicketLines(nextLines) {
    clear();
    const missing = [];

    for (const row of nextLines || []) {
      const product = inventory.get(row.productId);
      const qty = Math.max(0, Number(row.quantity) || 0);
      if (!product || qty <= 0) {
        missing.push(row.name || row.productId);
        continue;
      }

      const take = Math.min(qty, Math.max(0, product.stock));
      if (take <= 0) {
        missing.push(product.name);
        continue;
      }

      product.stock -= take;
      lines.set(product.id, {
        productId: product.id,
        name: row.name || product.name,
        unitPrice: Number(row.unitPrice ?? product.price),
        unitCost: Number(row.unitCost ?? product.cost),
        quantity: take,
      });
    }

    notify();
    return { ok: lines.size > 0, missing };
  }

  /**
   * Snapshot lines without clearing (for park).
   */
  function getLines() {
    return Array.from(lines.values()).map((line) => ({ ...line }));
  }

  /**
   * Complete checkout — clears ticket and returns sale summary for dashboard.
   * @returns {{ revenue: number, cost: number, profit: number, units: number, lines: Array<{ productId: string, title: string, quantity: number, unitPrice: number, unit_cost_at_sale: number }> }}
   */
  function checkout() {
    const { subtotal, discount, total, totalCost, grossProfit, itemCount, items } = getSnapshot();
    const saleLines = items.map((line) => ({
      productId: line.productId,
      title: line.name,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      unit_cost_at_sale: line.unitCost,
    }));
    const sale = {
      revenue: total,
      subtotal,
      discount,
      cost: totalCost,
      profit: grossProfit,
      units: itemCount,
      lines: saleLines,
    };
    lines.clear();
    discountAmount = 0;
    notify();
    return sale;
  }

  /**
   * Find a catalog product by barcode or SKU.
   * @param {string} code
   * @returns {CatalogProduct | undefined}
   */
  function findByBarcode(code) {
    const needle = String(code || '').trim().toLowerCase();
    if (!needle) return undefined;

    for (const product of inventory.values()) {
      const barcode = String(product.barcode || '').toLowerCase();
      const sku = String(product.sku || '').toLowerCase();
      if (barcode === needle || sku === needle) return product;
    }
    return undefined;
  }

  /**
   * Add one unit by barcode / SKU.
   * @param {string} code
   * @returns {{ ok: boolean, product?: CatalogProduct, reason?: string }}
   */
  function addByBarcode(code) {
    const product = findByBarcode(code);
    if (!product) return { ok: false, reason: 'not_found' };
    if (product.stock <= 0) return { ok: false, product, reason: 'out_of_stock' };

    const added = addItem(product.id);
    return added
      ? { ok: true, product }
      : { ok: false, product, reason: 'out_of_stock' };
  }

  function subscribe(fn) {
    listeners.add(fn);
    fn(getSnapshot());
    return () => listeners.delete(fn);
  }

  return {
    addItem,
    addByBarcode,
    findByBarcode,
    adjustQuantity,
    setDiscount,
    clear,
    syncCatalogStock,
    resetCatalog,
    checkout,
    loadTicketLines,
    getLines,
    subscribe,
    getSnapshot,
  };
}
