/**
 * Shamaadan Central Dashboard & Accounting Suite — admin application layer.
 */
import { getSharedDashboardState, LEDGER_METRICS } from '../dashboard.js';
import { formatLyd } from '../shared/format.js';
import {
  buildAdminShell,
  ledgerMatrixHtml,
  inventoryTableHtml,
  transactionFeedHtml,
  productFormHtml,
} from './template.js';

const AUTH_KEY = 'shamaadan_admin_auth';
const DEFAULT_PIN = 'shamaadan';

/**
 * @param {HTMLElement} root
 */
export async function mount(root) {
  const state = getSharedDashboardState();
  let editingProductId = null;

  root.className = 'dashboard-app';
  root.innerHTML = buildAdminShell();

  const els = {
    authGate: root.querySelector('[data-auth-gate]'),
    dashApp: root.querySelector('[data-dash-app]'),
    authForm: root.querySelector('[data-auth-form]'),
    authError: root.querySelector('[data-auth-error]'),
    ledgerHost: root.querySelector('[data-ledger-host]'),
    transactionHost: root.querySelector('[data-transaction-host]'),
    marginHost: root.querySelector('[data-margin-host]'),
    inventoryHost: root.querySelector('[data-inventory-host]'),
    formHost: root.querySelector('[data-form-host]'),
    formTitle: root.querySelector('[data-form-title]'),
    productCount: root.querySelector('[data-product-count]'),
    lastUpdated: root.querySelector('[data-last-updated]'),
    pageTitle: root.querySelector('[data-page-title]'),
    views: root.querySelectorAll('[data-panel]'),
    navLinks: root.querySelectorAll('[data-view]'),
  };

  if (isAuthenticated()) {
    unlock();
  }

  els.authForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    const pin = new FormData(event.target).get('pin');
    const expected = window.__ENV__?.ADMIN_PIN || DEFAULT_PIN;

    if (pin === expected) {
      sessionStorage.setItem(AUTH_KEY, '1');
      unlock();
    } else {
      showAuthError('Invalid PIN. Please try again.');
    }
  });

  root.addEventListener('click', (event) => {
    const target = event.target;

    if (target.matches('[data-logout]')) {
      sessionStorage.removeItem(AUTH_KEY);
      lock();
      return;
    }

    if (target.matches('[data-refresh]')) {
      renderAll(state.getSnapshot());
      return;
    }

    if (target.matches('[data-seed-mock]')) {
      state.seedFromMock();
      editingProductId = null;
      renderForm();
      return;
    }

    const navBtn = target.closest('[data-view]');
    if (navBtn?.matches('button[data-view]')) {
      switchView(navBtn.dataset.view);
      return;
    }

    const editBtn = target.closest('[data-edit-product]');
    if (editBtn) {
      editingProductId = editBtn.dataset.editProduct;
      renderForm(state.getSnapshot().products.find((p) => p.id === editingProductId));
      switchView('inventory');
      return;
    }

    const deleteBtn = target.closest('[data-delete-product]');
    if (deleteBtn) {
      const id = deleteBtn.dataset.deleteProduct;
      if (confirm('Delete this product from the master inventory?')) {
        state.deleteProduct(id);
        if (editingProductId === id) {
          editingProductId = null;
          renderForm();
        }
      }
      return;
    }

    if (target.matches('[data-cancel-edit]')) {
      editingProductId = null;
      renderForm();
    }
  });

  root.addEventListener('submit', (event) => {
    const form = event.target.closest('[data-product-form]');
    if (!form) return;
    event.preventDefault();

    const data = new FormData(form);
    const imageUrls = String(data.get('imageUrls') ?? '')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    state.upsertProduct({
      id: data.get('id') || `p-${Date.now().toString(36)}`,
      title: String(data.get('title')),
      collectionName: String(data.get('collectionName')),
      costPrice: Number(data.get('costPrice')),
      retailPrice: Number(data.get('retailPrice')),
      stockQuantity: Number(data.get('stockQuantity')),
      barcode: String(data.get('barcode')),
      imageUrls,
    });

    editingProductId = null;
    renderForm();
    form.reset();
  });

  state.subscribe((snapshot) => renderAll(snapshot));
  state.startTransactionStream(60_000);

  function unlock() {
    els.authGate?.setAttribute('hidden', '');
    els.dashApp?.removeAttribute('hidden');
    renderForm();
  }

  function lock() {
    els.authGate?.removeAttribute('hidden');
    els.dashApp?.setAttribute('hidden', '');
    showAuthError('');
  }

  function showAuthError(msg) {
    if (!els.authError) return;
    if (!msg) {
      els.authError.hidden = true;
      els.authError.textContent = '';
      return;
    }
    els.authError.hidden = false;
    els.authError.textContent = msg;
  }

  function switchView(view) {
    els.navLinks.forEach((link) => {
      const active = link.dataset.view === view;
      link.classList.toggle('is-active', active);
      if (link.matches('button')) {
        link.toggleAttribute('aria-current', active);
      }
    });

    els.views.forEach((panel) => {
      const active = panel.dataset.panel === view;
      panel.classList.toggle('is-active', active);
      panel.hidden = !active;
    });

    const titles = {
      dashboard: 'Accounting Dashboard',
      inventory: 'Master Inventory Control',
    };
    if (els.pageTitle) els.pageTitle.textContent = titles[view] ?? 'Dashboard';
  }

  function renderForm(product = null) {
    if (!els.formHost) return;
    const editing = product ?? (editingProductId
      ? state.getSnapshot().products.find((p) => p.id === editingProductId)
      : null);

    if (els.formTitle) {
      els.formTitle.textContent = editing ? 'Edit Product' : 'Add Product';
    }
    els.formHost.innerHTML = productFormHtml(editing);
  }

  function renderAll(snapshot) {
    const { ledgers, transactions, products, updatedAt } = snapshot;

    if (els.ledgerHost) {
      els.ledgerHost.innerHTML = ledgerMatrixHtml(ledgers, LEDGER_METRICS);
    }

    if (els.transactionHost) {
      els.transactionHost.innerHTML = transactionFeedHtml(transactions);
    }

    if (els.marginHost) {
      els.marginHost.innerHTML = marginSummaryHtml(ledgers);
    }

    if (els.inventoryHost) {
      els.inventoryHost.innerHTML = inventoryTableHtml(products);
    }

    if (els.productCount) {
      els.productCount.textContent = `${products.length} product${products.length === 1 ? '' : 's'}`;
    }

    if (els.lastUpdated) {
      els.lastUpdated.textContent = `Last updated ${new Date(updatedAt).toLocaleString('en-LY')}`;
    }
  }

  return {
    destroy: () => state.stopTransactionStream(),
  };
}

function marginSummaryHtml(ledgers) {
  const combined = {
    sellNumber: ledgers.online.sellNumber + ledgers.pos.sellNumber,
    grossRevenue: ledgers.online.grossRevenue + ledgers.pos.grossRevenue,
    assetCost: ledgers.online.assetCost + ledgers.pos.assetCost,
    netProfit: ledgers.online.netProfit + ledgers.pos.netProfit,
  };

  const marginPct = combined.grossRevenue > 0
    ? ((combined.netProfit / combined.grossRevenue) * 100).toFixed(1)
    : '0.0';

  return `
    <dl class="dash-summary">
      <div class="dash-summary__row">
        <dt>Combined Revenue</dt>
        <dd>${formatLyd(combined.grossRevenue)}</dd>
      </div>
      <div class="dash-summary__row">
        <dt>Combined Asset Cost</dt>
        <dd class="dash-summary__cost">${formatLyd(combined.assetCost)}</dd>
      </div>
      <div class="dash-summary__row dash-summary__row--highlight">
        <dt>Net Profit (All Channels)</dt>
        <dd class="dash-summary__profit">${formatLyd(combined.netProfit)}</dd>
      </div>
      <div class="dash-summary__row">
        <dt>Blended Margin</dt>
        <dd>${marginPct}%</dd>
      </div>
      <div class="dash-summary__row">
        <dt>Online Share</dt>
        <dd>${channelShare(ledgers.online.grossRevenue, combined.grossRevenue)}</dd>
      </div>
      <div class="dash-summary__row">
        <dt>POS Share</dt>
        <dd>${channelShare(ledgers.pos.grossRevenue, combined.grossRevenue)}</dd>
      </div>
    </dl>
  `;
}

function channelShare(part, total) {
  if (!total) return '0%';
  return `${((part / total) * 100).toFixed(1)}%`;
}

function isAuthenticated() {
  return sessionStorage.getItem(AUTH_KEY) === '1';
}
