/**
 * POS checkout ticket state management.
 * Tracks line items, computes totals, and mutates mock inventory.
 */

/**
 * @typedef {object} CatalogProduct
 * @property {string} id
 * @property {string} sku
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

    return {
      items,
      itemCount,
      subtotal,
      totalCost,
      grossProfit: subtotal - totalCost,
      catalog: Array.from(inventory.values()),
    };
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

  function clear() {
    for (const line of lines.values()) {
      const product = inventory.get(line.productId);
      if (product) product.stock += line.quantity;
    }
    lines.clear();
    notify();
  }

  /**
   * Complete checkout — clears ticket and returns sale summary for dashboard.
   * @returns {{ revenue: number, cost: number, profit: number, units: number, lines: Array<{ productId: string, title: string, quantity: number, unitPrice: number, unit_cost_at_sale: number }> }}
   */
  function checkout() {
    const { subtotal, totalCost, grossProfit, itemCount, items } = getSnapshot();
    const saleLines = items.map((line) => ({
      productId: line.productId,
      title: line.name,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      unit_cost_at_sale: line.unitCost,
    }));
    const sale = { revenue: subtotal, cost: totalCost, profit: grossProfit, units: itemCount, lines: saleLines };
    lines.clear();
    notify();
    return sale;
  }

  function subscribe(fn) {
    listeners.add(fn);
    fn(getSnapshot());
    return () => listeners.delete(fn);
  }

  return { addItem, adjustQuantity, clear, checkout, subscribe, getSnapshot };
}
