/**
 * Shared inventory stock status helpers for storefront, POS, admin, and dashboard.
 */

/**
 * @param {number|string|null|undefined} stock
 * @param {number|string|null|undefined} [alertAt]
 * @returns {{ qty: number, status: 'out' | 'low' | 'ok', label: string, shortLabel: string }}
 */
export function getStockStatus(stock, alertAt = 5) {
  const qty = Math.max(0, Number(stock) || 0);
  const alert = Math.max(0, Number(alertAt) || 5);

  if (qty <= 0) {
    return {
      qty: 0,
      status: 'out',
      label: 'Out of stock',
      shortLabel: 'Out of stock',
    };
  }

  if (qty <= alert) {
    return {
      qty,
      status: 'low',
      label: qty === 1 ? 'Only 1 left' : `Only ${qty} left`,
      shortLabel: `${qty} left`,
    };
  }

  return {
    qty,
    status: 'ok',
    label: `${qty} in stock`,
    shortLabel: String(qty),
  };
}

/**
 * Compact HTML for admin / dashboard stock cells.
 * @param {number|string|null|undefined} stock
 * @param {number|string|null|undefined} [alertAt]
 * @returns {string}
 */
export function stockStatusCellHtml(stock, alertAt = 5) {
  const info = getStockStatus(stock, alertAt);
  if (info.status === 'out') {
    return `<span class="dash-stock dash-stock--out" title="Out of stock">Out of stock</span>`;
  }
  if (info.status === 'low') {
    return `<span class="dash-stock dash-stock--low" title="${escapeAttr(info.label)}">${info.qty} <small>low</small></span>`;
  }
  return `<span class="dash-stock dash-stock--ok" title="${escapeAttr(info.label)}">${info.qty}</span>`;
}

function escapeAttr(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
