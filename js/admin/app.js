/**
 * Shamaadan Main Dashboard — accounting + store catalog CRUD.
 * Store Catalog publishes products to the website and POS.
 * Auth: username + password via /api/auth (hashed server-side).
 */
import { getSharedDashboardState, LEDGER_METRICS } from '../dashboard.js';
import { formatLyd } from '../shared/format.js';
import { fetchSession, loginAdmin, logout } from '../shared/auth-client.js';
import { bindImageUploader } from './image-upload.js';
import {
  fetchAdminCatalog,
  persistDeleteCollection,
  persistDeleteCategory,
  persistUpsertCollection,
  persistUpsertCategory,
  persistUpsertProduct,
  persistDeleteProduct,
  isSupabaseReady,
} from './catalog-api.js';
import {
  buildAdminShell,
  ledgerMatrixHtml,
  inventoryTableHtml,
  catalogTableHtml,
  catalogFormHtml,
  collectionsPanelHtml,
  categoriesPanelHtml,
  collectionFormHtml,
  categoryFormHtml,
  transactionFeedHtml,
  productFormHtml,
} from './template.js';

/**
 * @param {HTMLElement} root
 */
export async function mount(root) {
  const state = getSharedDashboardState();
  let editingProductId = null;
  let editingCatalogId = null;
  let editingCollectionId = null;
  let editingCategoryId = null;
  let catalogFilter = 'All';
  /** @type {{ id: string, username: string, displayName: string, role: string } | null} */
  let currentUser = null;
  let sessionTimer = 0;

  root.className = 'dashboard-app';
  root.innerHTML = buildAdminShell();

  const els = {
    authGate: root.querySelector('[data-auth-gate]'),
    dashApp: root.querySelector('[data-dash-app]'),
    authForm: root.querySelector('[data-auth-form]'),
    authError: root.querySelector('[data-auth-error]'),
    authSubmit: root.querySelector('[data-auth-submit]'),
    adminUser: root.querySelector('[data-admin-user]'),
    ledgerHost: root.querySelector('[data-ledger-host]'),
    transactionHost: root.querySelector('[data-transaction-host]'),
    marginHost: root.querySelector('[data-margin-host]'),
    inventoryHost: root.querySelector('[data-inventory-host]'),
    formHost: root.querySelector('[data-form-host]'),
    formTitle: root.querySelector('[data-form-title]'),
    productCount: root.querySelector('[data-product-count]'),
    catalogHost: root.querySelector('[data-catalog-host]'),
    catalogFormHost: root.querySelector('[data-catalog-form-host]'),
    catalogFormTitle: root.querySelector('[data-catalog-form-title]'),
    catalogCount: root.querySelector('[data-catalog-count]'),
    collectionsHost: root.querySelector('[data-collections-host]'),
    collectionCount: root.querySelector('[data-collection-count]'),
    collectionFormHost: root.querySelector('[data-collection-form-host]'),
    categoriesHost: root.querySelector('[data-categories-host]'),
    categoryCount: root.querySelector('[data-category-count]'),
    categoryFormHost: root.querySelector('[data-category-form-host]'),
    catalogFilter: root.querySelector('[data-catalog-filter]'),
    lastUpdated: root.querySelector('[data-last-updated]'),
    pageTitle: root.querySelector('[data-page-title]'),
    views: root.querySelectorAll('[data-panel]'),
    navLinks: root.querySelectorAll('[data-view]'),
  };

  const session = await fetchSession('admin');
  if (session.authenticated && session.user) {
    currentUser = session.user;
    unlock();
    await refreshFromSupabase();
  } else {
    lock();
  }

  startSessionWatch();

  /**
   * Await live Supabase catalog, hydrate local state, re-render.
   */
  async function refreshFromSupabase() {
    if (!isSupabaseReady()) {
      console.warn('[admin] Supabase not configured — using local catalog only');
      renderAll(state.getSnapshot());
      return;
    }

    try {
      const catalog = await fetchAdminCatalog();
      state.hydrateCatalog(catalog);
      renderAll(state.getSnapshot());
      renderTaxonomyForms();
      renderCatalogForm();
      renderForm();
    } catch (err) {
      console.error('[admin] refreshFromSupabase failed:', err);
      window.alert(err?.message || 'Failed to sync catalog from Supabase.');
      renderAll(state.getSnapshot());
    }
  }

  els.authForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(event.target);
    const username = String(data.get('username') ?? '').trim();
    const password = String(data.get('password') ?? '');

    setAuthBusy(true);
    showAuthError('');
    const result = await loginAdmin(username, password);
    setAuthBusy(false);

    if (result.ok && result.user) {
      currentUser = result.user;
      event.target.reset();
      unlock();
      return;
    }

    showAuthError(result.error || 'Invalid username or password');
  });

  els.catalogFilter?.addEventListener('change', (event) => {
    catalogFilter = event.target.value || 'All';
    renderCatalog(state.getSnapshot());
  });

  root.addEventListener('click', async (event) => {
    const target = event.target;

    if (target.matches('[data-logout]')) {
      await logout('admin');
      currentUser = null;
      lock();
      return;
    }

    if (target.matches('[data-refresh]')) {
      await refreshFromSupabase();
      return;
    }

    if (target.matches('[data-seed-mock]')) {
      state.seedFromMock();
      editingProductId = null;
      editingCatalogId = null;
      editingCollectionId = null;
      editingCategoryId = null;
      catalogFilter = 'All';
      renderForm();
      renderCatalogForm();
      renderTaxonomyForms();
      return;
    }

    const navBtn = target.closest('[data-view]');
    if (navBtn?.matches('button[data-view]')) {
      switchView(navBtn.dataset.view);
      return;
    }

    const filterCollection = target.closest('[data-filter-collection]');
    if (filterCollection) {
      catalogFilter = filterCollection.dataset.filterCollection || 'All';
      if (els.catalogFilter) els.catalogFilter.value = catalogFilter;
      switchView('catalog');
      renderCatalog(state.getSnapshot());
      return;
    }

    const editCollection = target.closest('[data-edit-collection]');
    if (editCollection) {
      editingCollectionId = editCollection.dataset.editCollection;
      renderCollectionForm();
      switchView('taxonomy');
      return;
    }

    const deleteCollection = target.closest('[data-delete-collection]');
    if (deleteCollection) {
      const id = deleteCollection.dataset.deleteCollection;
      const item = state.getSnapshot().collections.find((c) => c.id === id);
      if (!item) return;
      const reassignTo = window.prompt(
        `Delete collection "${item.name}"?\nProducts will move to this collection (leave blank to use General):`,
        'General',
      );
      if (reassignTo === null) return;

      try {
        const catalog = await persistDeleteCollection(id, reassignTo.trim() || 'General');
        state.hydrateCatalog(catalog);
        renderAll(state.getSnapshot());
        renderTaxonomyForms();
      } catch (err) {
        console.error('[admin] deleteCollection failed:', err);
        window.alert(err?.message || 'Cannot delete this collection because products are still assigned to it. Please reassign the products first.');
        await refreshFromSupabase();
        return;
      }

      if (editingCollectionId === id) {
        editingCollectionId = null;
        renderCollectionForm();
      }
      return;
    }

    if (target.matches('[data-cancel-collection-edit]')) {
      editingCollectionId = null;
      renderCollectionForm();
      return;
    }

    const editCategory = target.closest('[data-edit-category]');
    if (editCategory) {
      editingCategoryId = editCategory.dataset.editCategory;
      renderCategoryForm();
      switchView('taxonomy');
      return;
    }

    const deleteCategory = target.closest('[data-delete-category]');
    if (deleteCategory) {
      const id = deleteCategory.dataset.deleteCategory;
      const item = state.getSnapshot().categories.find((c) => c.id === id);
      if (!item) return;
      const reassignTo = window.prompt(
        `Delete category "${item.name}"?\nProducts will move to this category (leave blank to use General):`,
        'General',
      );
      if (reassignTo === null) return;

      try {
        const catalog = await persistDeleteCategory(id, reassignTo.trim() || 'General');
        state.hydrateCatalog(catalog);
        renderAll(state.getSnapshot());
        renderTaxonomyForms();
      } catch (err) {
        console.error('[admin] deleteCategory failed:', err);
        window.alert(err?.message || 'Cannot delete this category because products are still assigned to it. Please reassign the products first.');
        await refreshFromSupabase();
        return;
      }

      if (editingCategoryId === id) {
        editingCategoryId = null;
        renderCategoryForm();
      }
      return;
    }

    if (target.matches('[data-cancel-category-edit]')) {
      editingCategoryId = null;
      renderCategoryForm();
      return;
    }

    const editCatalog = target.closest('[data-edit-catalog]');
    if (editCatalog) {
      editingCatalogId = editCatalog.dataset.editCatalog;
      renderCatalogForm(state.getSnapshot().products.find((p) => p.id === editingCatalogId));
      switchView('catalog');
      return;
    }

    const deleteCatalog = target.closest('[data-delete-catalog]');
    if (deleteCatalog) {
      const id = deleteCatalog.dataset.deleteCatalog;
      if (confirm('Remove this product from the website store?')) {
        try {
          const catalog = await persistDeleteProduct(id);
          state.hydrateCatalog(catalog);
          renderAll(state.getSnapshot());
        } catch (err) {
          console.error('[admin] deleteProduct failed:', err);
          window.alert(err?.message || 'Failed to delete product in Supabase.');
          await refreshFromSupabase();
        }
        if (editingCatalogId === id) {
          editingCatalogId = null;
          renderCatalogForm();
        }
        if (editingProductId === id) {
          editingProductId = null;
          renderForm();
        }
      }
      return;
    }

    if (target.matches('[data-cancel-catalog-edit]')) {
      editingCatalogId = null;
      renderCatalogForm();
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
        try {
          const catalog = await persistDeleteProduct(id);
          state.hydrateCatalog(catalog);
          renderAll(state.getSnapshot());
        } catch (err) {
          console.error('[admin] deleteProduct failed:', err);
          window.alert(err?.message || 'Failed to delete product in Supabase.');
          await refreshFromSupabase();
        }
        if (editingProductId === id) {
          editingProductId = null;
          renderForm();
        }
        if (editingCatalogId === id) {
          editingCatalogId = null;
          renderCatalogForm();
        }
      }
      return;
    }

    if (target.matches('[data-cancel-edit]')) {
      editingProductId = null;
      renderForm();
    }
  });

  root.addEventListener('submit', async (event) => {
    const collectionForm = event.target.closest('[data-collection-form]');
    if (collectionForm) {
      event.preventDefault();
      const data = new FormData(collectionForm);
      try {
        const catalog = await persistUpsertCollection({
          id: String(data.get('id') || ''),
          name: String(data.get('name') || '').trim(),
          description: String(data.get('description') || '').trim(),
        }, String(data.get('renameFrom') || ''));
        state.hydrateCatalog(catalog);
        renderAll(state.getSnapshot());
      } catch (err) {
        console.error('[admin] upsertCollection failed:', err);
        window.alert(err?.message || 'Failed to save collection.');
      }
      editingCollectionId = null;
      renderCollectionForm();
      return;
    }

    const categoryForm = event.target.closest('[data-category-form]');
    if (categoryForm) {
      event.preventDefault();
      const data = new FormData(categoryForm);
      try {
        const catalog = await persistUpsertCategory({
          id: String(data.get('id') || ''),
          name: String(data.get('name') || '').trim(),
          description: String(data.get('description') || '').trim(),
        }, String(data.get('renameFrom') || ''));
        state.hydrateCatalog(catalog);
        renderAll(state.getSnapshot());
      } catch (err) {
        console.error('[admin] upsertCategory failed:', err);
        window.alert(err?.message || 'Failed to save category.');
      }
      editingCategoryId = null;
      renderCategoryForm();
      return;
    }

    const catalogForm = event.target.closest('[data-catalog-form]');
    if (catalogForm) {
      event.preventDefault();
      await saveProductFromForm(catalogForm);
      editingCatalogId = null;
      renderCatalogForm();
      return;
    }

    const form = event.target.closest('[data-product-form]');
    if (!form) return;
    event.preventDefault();
    await saveProductFromForm(form);
    editingProductId = null;
    renderForm();
  });

  state.subscribe((snapshot) => renderAll(snapshot));
  state.startTransactionStream(60_000);

  async function saveProductFromForm(form) {
    const data = new FormData(form);
    const imageUrls = String(data.get('imageUrls') ?? '')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    const collectionName = String(data.get('collectionName'));
    const category = String(data.get('category') || collectionName);

    const product = {
      id: data.get('id') || undefined,
      title: String(data.get('title')),
      collectionName,
      category,
      costPrice: Number(data.get('costPrice')),
      retailPrice: Number(data.get('retailPrice')),
      stockQuantity: Number(data.get('stockQuantity')),
      barcode: String(data.get('barcode')),
      imageUrls,
    };

    try {
      const catalog = await persistUpsertProduct(product);
      state.hydrateCatalog(catalog);
      renderAll(state.getSnapshot());
    } catch (err) {
      console.error('[admin] upsertProduct failed:', err);
      window.alert(err?.message || 'Failed to save product to Supabase.');
      // Keep a local draft so the user doesn't lose form work offline
      state.upsertProduct({
        ...product,
        id: product.id || `p-${Date.now().toString(36)}`,
      });
      if (collectionName) state.upsertCollection({ name: collectionName });
      if (category) state.upsertCategory({ name: category });
    }
  }

  function unlock() {
    els.authGate?.setAttribute('hidden', '');
    els.dashApp?.removeAttribute('hidden');
    if (els.adminUser && currentUser) {
      els.adminUser.hidden = false;
      els.adminUser.textContent = currentUser.displayName || currentUser.username;
    }
    renderForm();
    renderCatalogForm();
    renderTaxonomyForms();
    switchView('catalog');
  }

  function lock() {
    els.authGate?.removeAttribute('hidden');
    els.dashApp?.setAttribute('hidden', '');
    if (els.adminUser) {
      els.adminUser.hidden = true;
      els.adminUser.textContent = '';
    }
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

  function setAuthBusy(busy) {
    if (els.authSubmit) {
      els.authSubmit.disabled = busy;
      els.authSubmit.textContent = busy ? 'Signing in…' : 'Sign in';
    }
  }

  function startSessionWatch() {
    window.clearInterval(sessionTimer);
    sessionTimer = window.setInterval(async () => {
      if (!currentUser) return;
      const next = await fetchSession('admin');
      if (!next.authenticated) {
        currentUser = null;
        lock();
        showAuthError('Session expired. Please sign in again.');
      }
    }, 60_000);
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
      catalog: 'Store Catalog — Website Products',
      taxonomy: 'Collections & Categories',
      inventory: 'Inventory Costs',
    };
    if (els.pageTitle) els.pageTitle.textContent = titles[view] ?? 'Main Dashboard';
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
    const form = els.formHost.querySelector('[data-product-form]');
    if (form) bindImageUploader(form);
  }

  function renderCatalogForm(product = null) {
    if (!els.catalogFormHost) return;
    const snapshot = state.getSnapshot();
    const editing = product ?? (editingCatalogId
      ? snapshot.products.find((p) => p.id === editingCatalogId)
      : null);
    const collectionOptions = snapshot.collections.map((c) => c.name);
    const categoryOptions = snapshot.categories.map((c) => c.name);

    if (els.catalogFormTitle) {
      els.catalogFormTitle.textContent = editing ? 'Edit Store Product' : 'Add Store Product';
    }
    els.catalogFormHost.innerHTML = catalogFormHtml(editing, collectionOptions, categoryOptions);
    const form = els.catalogFormHost.querySelector('[data-catalog-form]');
    if (form) bindImageUploader(form);
  }

  function renderCollectionForm() {
    if (!els.collectionFormHost) return;
    const item = editingCollectionId
      ? state.getSnapshot().collections.find((c) => c.id === editingCollectionId)
      : null;
    els.collectionFormHost.innerHTML = collectionFormHtml(item);
  }

  function renderCategoryForm() {
    if (!els.categoryFormHost) return;
    const item = editingCategoryId
      ? state.getSnapshot().categories.find((c) => c.id === editingCategoryId)
      : null;
    els.categoryFormHost.innerHTML = categoryFormHtml(item);
  }

  function renderTaxonomyForms() {
    renderCollectionForm();
    renderCategoryForm();
  }

  function renderCatalog(snapshot) {
    const { products, collections, categories } = snapshot;

    if (els.collectionsHost) {
      els.collectionsHost.innerHTML = collectionsPanelHtml(collections);
    }

    if (els.categoriesHost) {
      els.categoriesHost.innerHTML = categoriesPanelHtml(categories);
    }

    if (els.collectionCount) {
      els.collectionCount.textContent = `${collections.length} collection${collections.length === 1 ? '' : 's'}`;
    }

    if (els.categoryCount) {
      els.categoryCount.textContent = `${categories.length} categor${categories.length === 1 ? 'y' : 'ies'}`;
    }

    if (els.catalogFilter) {
      const current = catalogFilter;
      els.catalogFilter.innerHTML = `
        <option value="All">All collections</option>
        ${collections.map((c) => `
          <option value="${escapeAttr(c.name)}"${c.name === current ? ' selected' : ''}>${escapeHtml(c.name)}</option>
        `).join('')}
      `;
    }

    if (els.catalogHost) {
      els.catalogHost.innerHTML = catalogTableHtml(products, catalogFilter);
    }

    if (els.catalogCount) {
      const count = catalogFilter === 'All'
        ? products.length
        : products.filter((p) => p.collectionName === catalogFilter).length;
      els.catalogCount.textContent = `${count} product${count === 1 ? '' : 's'}`;
    }

    renderTaxonomyForms();
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

    renderCatalog(snapshot);
    renderCatalogForm();

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

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/"/g, '&quot;');
}
