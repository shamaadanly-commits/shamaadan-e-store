/**
 * Admin Dashboard — inventory analytics, cost/retail pricing.
 * Uses shared Supabase client (products + inventory_transactions trigger).
 */
import {
  getProducts,
  updateProductPricing,
  logInventoryTransaction,
} from '../shared/supabase.js';

const els = {
  status: document.querySelector('[data-status]'),
  products: document.querySelector('[data-products]'),
  metrics: document.querySelector('[data-metrics]'),
  refresh: document.querySelector('[data-refresh]'),
};

/** @type {object[]} */
let products = [];

function money(n) {
  return new Intl.NumberFormat('en-LY', {
    style: 'currency',
    currency: 'LYD',
    minimumFractionDigits: 2,
  }).format(Number(n) || 0);
}

function setStatus(message, tone = 'info') {
  if (!els.status) return;
  els.status.textContent = message;
  els.status.dataset.tone = tone;
}

function computeMetrics(rows) {
  const active = rows.filter((p) => p.is_active !== false);
  const wholesaleValue = active.reduce(
    (sum, p) => sum + Number(p.wholesale_cost ?? 0) * Number(p.stock_quantity ?? 0),
    0,
  );
  const retailValue = active.reduce(
    (sum, p) => sum + Number(p.retail_price ?? 0) * Number(p.stock_quantity ?? 0),
    0,
  );
  const unitsOnHand = active.reduce((sum, p) => sum + Number(p.stock_quantity ?? 0), 0);
  const lowStock = active.filter((p) => {
    const stock = Number(p.stock_quantity ?? 0);
    const alertAt = Number(p.min_stock_alert ?? 5);
    return stock > 0 && stock <= alertAt;
  }).length;
  const outOfStock = active.filter((p) => Number(p.stock_quantity ?? 0) <= 0).length;
  const avgMargin = active.length
    ? active.reduce((sum, p) => {
      const cost = Number(p.wholesale_cost ?? 0);
      const price = Number(p.retail_price ?? 0);
      if (!price) return sum;
      return sum + ((price - cost) / price) * 100;
    }, 0) / active.length
    : 0;

  return {
    productCount: active.length,
    unitsOnHand,
    wholesaleValue,
    retailValue,
    potentialProfit: retailValue - wholesaleValue,
    lowStock,
    outOfStock,
    avgMargin,
  };
}

function renderMetrics(rows) {
  if (!els.metrics) return;
  const m = computeMetrics(rows);

  els.metrics.innerHTML = `
    <article class="metric">
      <p class="metric__label">Products</p>
      <p class="metric__value">${m.productCount}</p>
    </article>
    <article class="metric">
      <p class="metric__label">Units on hand</p>
      <p class="metric__value">${m.unitsOnHand}</p>
    </article>
    <article class="metric">
      <p class="metric__label">Wholesale value</p>
      <p class="metric__value">${money(m.wholesaleValue)}</p>
    </article>
    <article class="metric">
      <p class="metric__label">Retail inventory value</p>
      <p class="metric__value">${money(m.retailValue)}</p>
    </article>
    <article class="metric">
      <p class="metric__label">Potential profit</p>
      <p class="metric__value metric__value--profit">${money(m.potentialProfit)}</p>
    </article>
    <article class="metric">
      <p class="metric__label">Avg margin</p>
      <p class="metric__value">${m.avgMargin.toFixed(1)}%</p>
    </article>
    <article class="metric">
      <p class="metric__label">Low stock</p>
      <p class="metric__value">${m.lowStock}</p>
    </article>
    <article class="metric">
      <p class="metric__label">Out of stock</p>
      <p class="metric__value metric__value--warn">${m.outOfStock}</p>
    </article>
  `;
}

function marginPct(cost, price) {
  const c = Number(cost) || 0;
  const p = Number(price) || 0;
  if (!p) return '—';
  return `${(((p - c) / p) * 100).toFixed(1)}%`;
}

function stockClass(product) {
  const stock = Number(product.stock_quantity ?? 0);
  const alertAt = Number(product.min_stock_alert ?? 5);
  if (stock <= 0) return 'is-out';
  if (stock <= alertAt) return 'is-low';
  return 'is-ok';
}

function renderProducts(rows) {
  if (!els.products) return;

  if (!rows.length) {
    els.products.innerHTML = '<p class="empty">No products found. Seed the <code>products</code> table in Supabase.</p>';
    return;
  }

  els.products.innerHTML = `
    <table class="table">
      <thead>
        <tr>
          <th scope="col">Product</th>
          <th scope="col">Stock</th>
          <th scope="col">Wholesale</th>
          <th scope="col">Retail</th>
          <th scope="col">Margin</th>
          <th scope="col"><span class="visually-hidden">Actions</span></th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((p) => `
          <tr data-product-id="${escapeAttr(p.id)}">
            <td>
              <strong>${escapeHtml(p.name || 'Untitled')}</strong>
              <div class="muted">${escapeHtml(p.barcode || '—')}${p.is_active === false ? ' · inactive' : ''}</div>
            </td>
            <td>
              <span class="stock ${stockClass(p)}">${Number(p.stock_quantity ?? 0)}</span>
            </td>
            <td>
              <input class="input" type="number" min="0" step="0.01" data-cost
                value="${Number(p.wholesale_cost ?? 0)}" aria-label="Wholesale cost for ${escapeAttr(p.name || '')}">
            </td>
            <td>
              <input class="input" type="number" min="0" step="0.01" data-price
                value="${Number(p.retail_price ?? 0)}" aria-label="Retail price for ${escapeAttr(p.name || '')}">
            </td>
            <td>${marginPct(p.wholesale_cost, p.retail_price)}</td>
            <td class="actions">
              <button type="button" class="btn btn--ghost" data-save-pricing>Save</button>
              <button type="button" class="btn btn--ghost" data-restock title="Log +1 via inventory_transactions">+1 stock</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

async function loadCatalog() {
  setStatus('Loading products…');
  try {
    products = await getProducts();
    renderMetrics(products);
    renderProducts(products);
    setStatus(`${products.length} products · synced ${new Date().toLocaleTimeString()}`, 'ok');
  } catch (err) {
    products = [];
    renderMetrics([]);
    renderProducts([]);
    setStatus(err.message || 'Failed to load products', 'error');
  }
}

els.refresh?.addEventListener('click', () => {
  loadCatalog();
});

els.products?.addEventListener('click', async (event) => {
  const row = event.target.closest('[data-product-id]');
  if (!row) return;
  const productId = row.dataset.productId;

  if (event.target.closest('[data-save-pricing]')) {
    const cost = Number(row.querySelector('[data-cost]')?.value);
    const price = Number(row.querySelector('[data-price]')?.value);
    setStatus('Saving pricing…');
    try {
      await updateProductPricing(productId, cost, price);
      setStatus('Pricing updated', 'ok');
      await loadCatalog();
    } catch (err) {
      setStatus(err.message || 'Pricing update failed', 'error');
    }
    return;
  }

  if (event.target.closest('[data-restock]')) {
    setStatus('Logging restock…');
    try {
      await logInventoryTransaction({
        product_id: productId,
        quantity_changed: 1,
        type: 'restock',
        source: 'dashboard',
        notes: 'Manual +1 from admin dashboard',
      });
      setStatus('Stock increased via inventory transaction', 'ok');
      await loadCatalog();
    } catch (err) {
      setStatus(err.message || 'Stock update failed', 'error');
    }
  }
});

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/"/g, '&quot;');
}

loadCatalog();
