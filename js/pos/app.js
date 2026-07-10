/**
 * POS register — Loyverse-style tablet interface with camera barcode scanning.
 * Staff unlock via numeric PIN (mapped to user id for sale attribution).
 */
import { getSupabase } from '../config/supabase.js';
import { getSharedDashboardState, toPosCatalogRow } from '../dashboard.js';
import { formatLyd } from '../shared/format.js';
import { fetchSession, loginPosPin, logout } from '../shared/auth-client.js';
import { createCartState } from './cart-state.js';
import { createDashboard, renderDashboard } from './dashboard.js';
import { createBarcodeScanner } from './scanner.js';
import { printReceipt } from './receipt.js';
import { pinGateHtml, bindPinGate } from './pin-gate.js';

const CATEGORY_COLORS = {
  Candles: '#f59e0b',
  Diffusers: '#10b981',
  Incense: '#8b5cf6',
  Sprays: '#06b6d4',
  Sets: '#ef4444',
  Bakhoor: '#d97706',
  Accessories: '#64748b',
  Oils: '#eab308',
  General: '#3b82f6',
  'Gift Sets': '#ef4444',
};

/**
 * @param {HTMLElement} root
 */
export async function mount(root) {
  root.className = 'pos';
  document.body.style.background = '#f3f4f6';
  document.documentElement.style.colorScheme = 'light';

  const session = await fetchSession('pos');
  if (session.authenticated && session.user) {
    await mountRegister(root, session.user);
    return;
  }

  await mountPinGate(root);
}

/**
 * @param {HTMLElement} root
 */
async function mountPinGate(root) {
  root.innerHTML = pinGateHtml();
  const gate = bindPinGate(root, {
    onSubmit: async (pin) => {
      const result = await loginPosPin(pin);
      if (!result.ok || !result.user) {
        gate.setError(result.error || 'Invalid PIN');
        gate.shake();
        gate.clear();
        return;
      }
      await mountRegister(root, result.user);
    },
  });
}

/**
 * @param {HTMLElement} root
 * @param {{ id: string, username: string, displayName: string, role: string }} staff
 */
async function mountRegister(root, staff) {
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
  const categories = ['All', ...new Set(catalog.map((p) => p.category).filter(Boolean))];

  root.innerHTML = buildShell(categories, staff);

  const els = {
    clock: root.querySelector('[data-clock]'),
    grid: root.querySelector('[data-product-grid]'),
    lines: root.querySelector('[data-line-items]'),
    itemCount: root.querySelector('[data-item-count]'),
    subtotal: root.querySelector('[data-subtotal]'),
    grand: root.querySelector('[data-grand-total]'),
    checkout: root.querySelector('[data-checkout]'),
    search: root.querySelector('[data-search]'),
    categories: root.querySelector('[data-categories]'),
    dashboard: root.querySelector('[data-dashboard]'),
    toast: root.querySelector('[data-pos-toast]'),
    staffLabel: root.querySelector('[data-staff-name]'),
  };

  let searchQuery = '';
  let activeCategory = 'All';

  const scanner = createBarcodeScanner({
    root,
    onScan: (code) => handleBarcode(code),
    onError: (message) => showToast(els.toast, message || 'Camera error'),
  });

  function refreshCatalog() {
    renderProductGrid(els.grid, cart.getSnapshot().catalog, searchQuery, activeCategory);
  }

  function handleBarcode(code) {
    const result = cart.addByBarcode(code);
    if (result.ok) {
      showToast(els.toast, `✓ ${result.product.name}`);
      return;
    }
    if (result.reason === 'out_of_stock') {
      showToast(els.toast, `${result.product?.name || 'Item'} is out of stock`);
      return;
    }
    showToast(els.toast, `No product for barcode ${code}`);
  }

  cart.subscribe((snapshot) => {
    refreshCatalog();
    renderLineItems(els.lines, snapshot.items);
    if (els.itemCount) {
      els.itemCount.textContent = snapshot.itemCount
        ? `${snapshot.itemCount} item${snapshot.itemCount === 1 ? '' : 's'}`
        : 'Empty';
    }
    els.subtotal.textContent = formatLyd(snapshot.subtotal);
    els.grand.textContent = formatLyd(snapshot.subtotal);
    els.checkout.disabled = snapshot.items.length === 0;
  });

  dashboard.subscribe((state) => {
    if (els.dashboard) renderDashboard(els.dashboard, state);
  });

  startClock(els.clock);

  root.addEventListener('click', async (event) => {
    const target = event.target;

    if (target.closest('[data-pos-lock]')) {
      await logout('pos');
      scanner.stop?.();
      await mountPinGate(root);
      return;
    }

    if (target.closest('[data-open-scanner]')) {
      scanner.start();
      return;
    }

    const categoryChip = target.closest('[data-category]');
    if (categoryChip) {
      activeCategory = categoryChip.dataset.category;
      els.categories?.querySelectorAll('[data-category]').forEach((chip) => {
        chip.classList.toggle('is-active', chip.dataset.category === activeCategory);
      });
      refreshCatalog();
      return;
    }

    const productCard = target.closest('[data-pos-product]');
    if (productCard) {
      const added = cart.addItem(productCard.dataset.posProduct);
      if (added) showToast(els.toast, 'Added to ticket');
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

    if (target.matches('[data-remove-line]')) {
      const line = cart.getSnapshot().items.find((i) => i.productId === target.dataset.productId);
      if (line) cart.adjustQuantity(target.dataset.productId, -line.quantity);
      return;
    }

    if (target.matches('[data-clear-ticket]')) {
      cart.clear();
      return;
    }

    if (target.matches('[data-checkout]')) {
      const sale = cart.checkout();
      if (sale.units > 0) {
        const receiptSale = {
          ...sale,
          receiptNo: `R${Date.now().toString(36).toUpperCase()}`,
          register: 'Register #1',
          cashier: staff.displayName || staff.username,
          staffUserId: staff.id,
          paidAt: new Date(),
        };
        centralState.recordPosSale({
          ...sale,
          staffUserId: staff.id,
          staffName: staff.displayName || staff.username,
        });
        dashboard.refresh();
        showSaleComplete(root, receiptSale, els.toast);
      }
    }

    if (target.closest('[data-print-receipt]')) {
      const btn = target.closest('[data-print-receipt]');
      const raw = btn.getAttribute('data-print-receipt');
      try {
        const sale = JSON.parse(decodeURIComponent(raw));
        printReceipt({
          ...sale,
          paidAt: sale.paidAt ? new Date(sale.paidAt) : new Date(),
        });
      } catch {
        showToast(els.toast, 'Could not open receipt');
      }
      root.querySelector('[data-sale-modal]')?.remove();
      return;
    }

    if (target.closest('[data-skip-receipt]') || target.matches('[data-sale-backdrop]')) {
      root.querySelector('[data-sale-modal]')?.remove();
      return;
    }

    if (target.matches('[data-toggle-metrics]')) {
      const open = root.classList.toggle('pos--metrics-open');
      if (els.dashboard) els.dashboard.hidden = !open;
    }
  });

  // Hardware wedge scanners type into focused fields then press Enter
  els.search?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    const value = event.target.value.trim();
    if (!value) return;

    const exact = cart.findByBarcode(value);
    if (exact) {
      event.preventDefault();
      handleBarcode(value);
      event.target.value = '';
      searchQuery = '';
      refreshCatalog();
    }
  });

  els.search?.addEventListener('input', (event) => {
    searchQuery = event.target.value.trim().toLowerCase();
    refreshCatalog();
  });
}

/**
 * @param {string[]} categories
 * @param {{ displayName?: string, username?: string }} staff
 */
function buildShell(categories, staff) {
  const staffName = staff.displayName || staff.username || 'Staff';
  return `
    <header class="pos__topbar">
      <div class="pos__topbar-left">
        <span class="pos__brand">Shamaadan</span>
        <span class="pos__register">Register #1</span>
        <span class="pos__staff" data-staff-name>${escapeHtml(staffName)}</span>
      </div>
      <div class="pos__topbar-meta">
        <span class="pos__clock" data-clock aria-live="off"></span>
        <button type="button" class="pos__scan-btn" data-open-scanner>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path d="M4 7V4h3M17 4h3v3M20 17v3h-3M7 20H4v-3"/>
            <path d="M7 12h10"/>
          </svg>
          Scan
        </button>
        <button type="button" class="pos__icon-btn" data-toggle-metrics aria-label="Toggle sales metrics">📊</button>
        <button type="button" class="pos__lock-btn" data-pos-lock>Lock</button>
      </div>
    </header>

    <div class="pos__workspace">
      <section class="pos__catalog" aria-label="Product catalog">
        <div class="pos__catalog-toolbar">
          <div class="pos__search-wrap">
            <svg class="pos__search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>
            </svg>
            <input type="search" class="pos__search" placeholder="Search or scan barcode…" data-search aria-label="Search products">
            <button type="button" class="pos__search-scan" data-open-scanner aria-label="Open camera scanner">📷</button>
          </div>
          <div class="pos__categories" data-categories role="tablist" aria-label="Categories">
            ${categories.map((cat, i) => `
              <button type="button" class="pos__category${i === 0 ? ' is-active' : ''}" data-category="${escapeAttr(cat)}" role="tab">${escapeHtml(cat)}</button>
            `).join('')}
          </div>
        </div>
        <div class="pos__product-grid" data-product-grid role="list"></div>
      </section>

      <aside class="pos__ticket" aria-label="Current ticket">
        <div class="pos__ticket-header">
          <div>
            <h2>Ticket</h2>
            <p class="pos__ticket-count" data-item-count>Empty</p>
          </div>
          <button type="button" class="pos__ticket-clear" data-clear-ticket>Clear all</button>
        </div>
        <div class="pos__line-items" data-line-items></div>
        <footer class="pos__ticket-footer">
          <div class="pos__totals-row">
            <span>Subtotal</span>
            <span data-subtotal>${formatLyd(0)}</span>
          </div>
          <div class="pos__totals-row pos__totals-row--grand">
            <span>Total</span>
            <span data-grand-total>${formatLyd(0)}</span>
          </div>
          <button type="button" class="pos__checkout-btn" data-checkout disabled>CHARGE</button>
          <p class="pos__checkout-hint">After charge you can print the receipt</p>
        </footer>
      </aside>
    </div>

    <section class="pos__dashboard" data-dashboard aria-label="Sales metrics" hidden></section>
    <div class="pos__toast" data-pos-toast hidden></div>
  `;
}

/**
 * Post-sale modal: print receipt or continue.
 * @param {HTMLElement} root
 * @param {import('./receipt.js').SaleReceipt} sale
 * @param {HTMLElement | null} toastEl
 */
function showSaleComplete(root, sale, toastEl) {
  root.querySelector('[data-sale-modal]')?.remove();

  const payload = encodeURIComponent(JSON.stringify({
    revenue: sale.revenue,
    cost: sale.cost,
    profit: sale.profit,
    units: sale.units,
    lines: sale.lines,
    receiptNo: sale.receiptNo,
    register: sale.register,
    cashier: sale.cashier,
    staffUserId: sale.staffUserId,
    paidAt: (sale.paidAt ?? new Date()).toISOString(),
  }));

  const modal = document.createElement('div');
  modal.className = 'pos-sale-modal';
  modal.dataset.saleModal = '';
  modal.innerHTML = `
    <div class="pos-sale-modal__backdrop" data-sale-backdrop></div>
    <div class="pos-sale-modal__card" role="dialog" aria-modal="true" aria-labelledby="pos-sale-title">
      <p class="pos-sale-modal__badge">Sale complete</p>
      <h2 id="pos-sale-title">${formatLyd(sale.revenue)}</h2>
      <p class="pos-sale-modal__meta">${sale.units} item${sale.units === 1 ? '' : 's'} · ${escapeHtml(sale.receiptNo || '')}</p>
      <div class="pos-sale-modal__actions">
        <button type="button" class="pos-sale-modal__print" data-print-receipt="${payload}">
          🖨 Print receipt
        </button>
        <button type="button" class="pos-sale-modal__skip" data-skip-receipt>Continue without printing</button>
      </div>
    </div>
  `;
  root.appendChild(modal);
  showToast(toastEl, `Sale complete · ${formatLyd(sale.revenue)}`);
}

function renderProductGrid(container, catalog, query, category) {
  let filtered = catalog;

  if (category && category !== 'All') {
    filtered = filtered.filter((p) => p.category === category);
  }

  if (query) {
    filtered = filtered.filter((p) =>
      p.name.toLowerCase().includes(query)
      || String(p.sku || '').toLowerCase().includes(query)
      || String(p.barcode || '').toLowerCase().includes(query),
    );
  }

  if (!filtered.length) {
    container.innerHTML = '<p class="pos__empty-catalog">No products found</p>';
    return;
  }

  container.innerHTML = filtered.map((p) => productCardHtml(p)).join('');
}

function productCardHtml(product) {
  const stockClass =
    product.stock <= 0 ? 'pos-card--out-of-stock' : product.stock <= 5 ? 'pos-card--low-stock' : '';
  const color = CATEGORY_COLORS[product.category] || CATEGORY_COLORS.General;
  const initial = escapeHtml(product.name.charAt(0).toUpperCase());

  return `
    <button
      type="button"
      class="pos-card ${stockClass}"
      data-pos-product="${product.id}"
      role="listitem"
      aria-label="${escapeAttr(product.name)}, ${formatLyd(product.price)}"
    >
      <div class="pos-card__thumb" style="--thumb-color:${color}" aria-hidden="true">
        <span>${initial}</span>
      </div>
      <div class="pos-card__info">
        <p class="pos-card__name">${escapeHtml(product.name)}</p>
        <p class="pos-card__price">${formatLyd(product.price)}</p>
      </div>
    </button>
  `;
}

function renderLineItems(container, items) {
  if (!items.length) {
    container.innerHTML = `
      <div class="pos__empty-ticket">
        <p class="pos__empty-ticket-title">No items yet</p>
        <p>Tap a product or scan a barcode</p>
      </div>
    `;
    return;
  }

  container.innerHTML = items.map((line) => `
    <div class="pos__line-item" data-line-id="${line.productId}">
      <div class="pos__line-item-main">
        <p class="pos__line-item-name">${escapeHtml(line.name)}</p>
        <p class="pos__line-item-meta">${formatLyd(line.unitPrice)} × ${line.quantity}</p>
      </div>
      <div class="pos__qty-controls">
        <button type="button" class="pos__qty-btn" data-qty-minus data-product-id="${line.productId}" aria-label="Decrease quantity">−</button>
        <span class="pos__qty-value">${line.quantity}</span>
        <button type="button" class="pos__qty-btn" data-qty-plus data-product-id="${line.productId}" aria-label="Increase quantity">+</button>
      </div>
      <div class="pos__line-item-end">
        <span class="pos__line-total">${formatLyd(line.unitPrice * line.quantity)}</span>
        <button type="button" class="pos__line-remove" data-remove-line data-product-id="${line.productId}" aria-label="Remove item">×</button>
      </div>
    </div>
  `).join('');
}

function showToast(el, message) {
  if (!el) return;
  el.textContent = message;
  el.hidden = false;
  el.classList.add('is-visible');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    el.classList.remove('is-visible');
    el.hidden = true;
  }, 1800);
}

function startClock(el) {
  if (!el) return;
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
