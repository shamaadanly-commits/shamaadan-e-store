/**
 * POS / Admin application layer — Loyverse-style two-column iPad interface.
 */
import { getSupabase } from '../config/supabase.js';
import { getSharedDashboardState, toPosCatalogRow } from '../dashboard.js';
import { formatLyd } from '../shared/format.js';
import { createCartState } from './cart-state.js';
import { createDashboard, renderDashboard } from './dashboard.js';

/**
 * @param {HTMLElement} root
 */
export async function mount(root) {
  const supabase = getSupabase();
  const centralState = getSharedDashboardState();
  let catalog = centralState.getSnapshot().products.map(toPosCatalogRow);

  if (supabase) {
    try {
      const { data, error } = await supabase.from('products').select('*').eq('active', true);
      if (!error && data?.length) {
        catalog = data.map((row) => toPosCatalogRow({
          id: row.id,
          barcode: row.barcode ?? row.sku,
          title: row.name,
          collectionName: row.category ?? 'General',
          retailPrice: Number(row.price),
          costPrice: Number(row.cost ?? 0),
          stockQuantity: row.stock ?? 0,
          imageUrls: row.image_urls ?? (row.image ? [row.image] : []),
        }));
      }
    } catch {
      // Use shared dashboard catalog
    }
  }

  const cart = createCartState(catalog);
  const dashboard = createDashboard(centralState);

  root.className = 'pos';
  root.innerHTML = buildShell();

  const els = {
    clock: root.querySelector('[data-clock]'),
    grid: root.querySelector('[data-product-grid]'),
    lines: root.querySelector('[data-line-items]'),
    subtotal: root.querySelector('[data-subtotal]'),
    cost: root.querySelector('[data-cost]'),
    profit: root.querySelector('[data-profit]'),
    grand: root.querySelector('[data-grand-total]'),
    checkout: root.querySelector('[data-checkout]'),
    clear: root.querySelector('[data-clear-ticket]'),
    search: root.querySelector('[data-search]'),
    dashboard: root.querySelector('[data-dashboard]'),
    adminLink: root.querySelector('[data-admin-link]'),
  };

  let searchQuery = '';

  cart.subscribe((snapshot) => {
    renderProductGrid(els.grid, snapshot.catalog, searchQuery);
    renderLineItems(els.lines, snapshot.items, cart);
    els.subtotal.textContent = formatLyd(snapshot.subtotal);
    els.cost.textContent = formatLyd(snapshot.totalCost);
    els.profit.textContent = formatLyd(snapshot.grossProfit);
    els.grand.textContent = formatLyd(snapshot.subtotal);
    els.checkout.disabled = snapshot.items.length === 0;
  });

  dashboard.subscribe((state) => {
    renderDashboard(els.dashboard, state);
  });

  startClock(els.clock);

  root.addEventListener('click', (event) => {
    const target = event.target;

    const productCard = target.closest('[data-pos-product]');
    if (productCard) {
      cart.addItem(productCard.dataset.posProduct);
      return;
    }

    if (target.matches('[data-qty-minus]')) {
      cart.adjustQuantity(target.dataset.productId, -1);
      return;
    }

    if (target.matches('[data-qty-plus]')) {
      cart.adjustQuantity(target.dataset.productId, 1);
      return;
    }

    if (target.matches('[data-clear-ticket]')) {
      cart.clear();
      return;
    }

    if (target.matches('[data-checkout]')) {
      const sale = cart.checkout();
      if (sale.units > 0) {
        centralState.recordPosSale(sale);
        dashboard.refresh();
      }
    }
  });

  els.search.addEventListener('input', (event) => {
    searchQuery = event.target.value.trim().toLowerCase();
    renderProductGrid(els.grid, cart.getSnapshot().catalog, searchQuery);
  });
}

function buildShell() {
  return `
    <header class="pos__topbar">
      <span class="pos__brand">SHAMAADAN POS</span>
      <div class="pos__topbar-meta">
        <a href="/?app=admin" class="pos__admin-link" data-admin-link>Admin Dashboard</a>
        <span class="pos__clock" data-clock aria-live="off"></span>
        <span>Register #1</span>
      </div>
    </header>

    <div class="pos__workspace">
      <section class="pos__catalog" aria-label="Product catalog">
        <div class="pos__catalog-header">
          <h2>Products</h2>
          <input type="search" class="pos__search" placeholder="Search…" data-search aria-label="Search products">
        </div>
        <div class="pos__product-grid" data-product-grid role="list"></div>
      </section>

      <aside class="pos__ticket" aria-label="Current ticket">
        <div class="pos__ticket-header">
          <h2>Current Ticket</h2>
          <button type="button" class="pos__ticket-clear" data-clear-ticket>Clear</button>
        </div>
        <div class="pos__line-items" data-line-items></div>
        <footer class="pos__ticket-footer">
          <div class="pos__totals-row">
            <span>Subtotal</span>
            <span data-subtotal>${formatLyd(0)}</span>
          </div>
          <div class="pos__totals-row">
            <span>Product Cost</span>
            <span data-cost>${formatLyd(0)}</span>
          </div>
          <div class="pos__totals-row">
            <span>Gross Profit</span>
            <span data-profit>${formatLyd(0)}</span>
          </div>
          <div class="pos__totals-row pos__totals-row--grand">
            <span>Total</span>
            <span data-grand-total>${formatLyd(0)}</span>
          </div>
          <button type="button" class="pos__checkout-btn" data-checkout disabled>Charge</button>
        </footer>
      </aside>
    </div>

    <section class="pos__dashboard" data-dashboard aria-label="Sales dashboard"></section>
  `;
}

function renderProductGrid(container, catalog, query) {
  const filtered = query
    ? catalog.filter((p) => p.name.toLowerCase().includes(query) || p.sku.toLowerCase().includes(query))
    : catalog;

  container.innerHTML = filtered.map((p) => productCardHtml(p)).join('');
}

function productCardHtml(product) {
  const stockClass =
    product.stock <= 0 ? 'pos-card--out-of-stock' : product.stock <= 5 ? 'pos-card--low-stock' : '';

  const stockLabel =
    product.stock <= 0
      ? 'Out of stock'
      : product.stock <= 5
        ? `${product.stock} left — low`
        : `${product.stock} in stock`;

  const stockTextClass =
    product.stock <= 0 ? 'pos-card__stock--out' : product.stock <= 5 ? 'pos-card__stock--low' : '';

  return `
    <button
      type="button"
      class="pos-card ${stockClass}"
      data-pos-product="${product.id}"
      role="listitem"
      aria-label="${escapeAttr(product.name)}, ${formatLyd(product.price)}"
    >
      <div class="pos-card__thumb" aria-hidden="true">${product.name.charAt(0)}</div>
      <div class="pos-card__info">
        <p class="pos-card__name">${escapeHtml(product.name)}</p>
        <p class="pos-card__price">${formatLyd(product.price)}</p>
        <p class="pos-card__stock ${stockTextClass}">${stockLabel}</p>
      </div>
    </button>
  `;
}

function renderLineItems(container, items, cart) {
  if (!items.length) {
    container.innerHTML = '<p class="pos__empty-ticket">Tap a product to add it to the ticket.</p>';
    return;
  }

  container.innerHTML = items.map((line) => `
    <div class="pos__line-item" data-line-id="${line.productId}">
      <p class="pos__line-item-name">${escapeHtml(line.name)}</p>
      <p class="pos__line-item-meta">${formatLyd(line.unitPrice)} each</p>
      <div class="pos__qty-controls">
        <button type="button" class="pos__qty-btn" data-qty-minus data-product-id="${line.productId}" aria-label="Decrease quantity">−</button>
        <span class="pos__qty-value">${line.quantity}</span>
        <button type="button" class="pos__qty-btn" data-qty-plus data-product-id="${line.productId}" aria-label="Increase quantity">+</button>
      </div>
      <span class="pos__line-total">${formatLyd(line.unitPrice * line.quantity)}</span>
    </div>
  `).join('');
}

function startClock(el) {
  const tick = () => {
    el.textContent = new Date().toLocaleString('en-LY', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };
  tick();
  setInterval(tick, 30_000);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/"/g, '&quot;');
}
