/**
 * Shamaadan Main Dashboard — accounting + store catalog CRUD.
 * Store Catalog publishes products to the website and POS.
 * Auth: username + password via /api/auth (hashed server-side).
 */
import { getSharedDashboardState, LEDGER_METRICS } from '../dashboard.js';
import { formatLyd } from '../shared/format.js';
import { fetchSession, loginAdmin, logout } from '../shared/auth-client.js';
import { isLiveDbId } from '../shared/ids.js';
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
  getOpenTickets,
  cancelOpenTicket,
  createSupplierInvoice,
  getSupplierInvoices,
} from '../../shared/supabase.js';
import {
  generateBarcodeValue,
  renderBarcodeInto,
  printBarcodeLabels,
} from '../shared/barcode.js';
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
  openTicketsPanelHtml,
  productFormHtml,
  purchaseFormHtml,
  purchaseLineRowHtml,
  supplierInvoicesTableHtml,
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
    openTicketsHost: root.querySelector('[data-open-tickets-host]'),
    marginHost: root.querySelector('[data-margin-host]'),
    inventoryHost: root.querySelector('[data-inventory-host]'),
    purchasesHost: root.querySelector('[data-purchases-host]'),
    purchaseFormHost: root.querySelector('[data-purchase-form-host]'),
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
  refreshOpenTickets();

  /**
   * Load parked POS tickets from Supabase into the accounting panel.
   */
  async function refreshOpenTickets() {
    if (!els.openTicketsHost) return;
    if (!isSupabaseReady()) {
      els.openTicketsHost.innerHTML = '<p class="dash-empty">Supabase not configured — open tickets unavailable.</p>';
      return;
    }

    try {
      const tickets = await getOpenTickets();
      els.openTicketsHost.innerHTML = openTicketsPanelHtml(tickets);
    } catch (err) {
      console.error('[admin] open tickets failed:', err);
      els.openTicketsHost.innerHTML = `<p class="dash-empty">${escapeHtml(err?.message || 'Failed to load open tickets.')}</p>`;
    }
  }

  /**
   * Await live Supabase catalog, replace local state, re-render.
   * Prefer this over calling hydrateCatalog directly after mutations.
   */
  async function refreshFromSupabase() {
    if (!isSupabaseReady()) {
      console.warn('[admin] Supabase not configured — using local catalog only');
      renderAll(state.getSnapshot());
      return;
    }

    try {
      const catalog = await fetchAdminCatalog();
      if (typeof state.hydrateCatalog === 'function') {
        state.hydrateCatalog(catalog);
      } else if (typeof state.replaceProducts === 'function') {
        state.replaceProducts(catalog.products || []);
      }
      renderAll(state.getSnapshot());
      renderTaxonomyForms();
      renderCatalogForm();
      renderForm();
      renderPurchaseForm();
    } catch (err) {
      console.error('[admin] refreshFromSupabase failed:', err);
      window.alert(err?.message || 'Failed to sync catalog from Supabase.');
      renderAll(state.getSnapshot());
    }
  }

  /**
   * Read a live UUID from the clicked control or its row.
   * @param {Element} el
   * @param {string} [datasetKey]
   */
  function readRowId(el, datasetKey) {
    const fromDataset = datasetKey ? el?.dataset?.[datasetKey] : '';
    const fromAttr = el?.getAttribute?.('data-id') || '';
    const fromRow = el?.closest?.('[data-id]')?.getAttribute('data-id') || '';
    const id = String(fromDataset || fromAttr || fromRow || '').trim();
    return id;
  }

  function assertLiveId(id, label = 'Item') {
    if (!isLiveDbId(id)) {
      throw new Error(
        `${label} is missing a live Supabase UUID (got "${id || 'empty'}"). `
          + 'Refresh the dashboard and try again — mock ids like p1 cannot be deleted from the database.',
      );
    }
    return id;
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

  root.addEventListener('input', (event) => {
    if (event.target.matches('[data-barcode-input]')) {
      updateBarcodePreview(event.target.closest('form'));
    }
  });

  root.addEventListener('click', async (event) => {
    const target = event.target;

    const generateBarcode = target.closest('[data-barcode-generate]');
    if (generateBarcode) {
      const form = generateBarcode.closest('form');
      const input = form?.querySelector('[data-barcode-input]');
      if (input) {
        input.value = generateBarcodeValue();
        updateBarcodePreview(form);
      }
      return;
    }

    const printBarcode = target.closest('[data-barcode-print]');
    if (printBarcode) {
      const form = printBarcode.closest('form');
      const input = form?.querySelector('[data-barcode-input]');
      const value = String(input?.value ?? '').trim();
      if (!value) {
        window.alert('Enter or generate a barcode first.');
        return;
      }
      try {
        printBarcodeLabels({
          value,
          title: form?.querySelector('[name="title"]')?.value || '',
          price: form?.querySelector('[name="retailPrice"]')?.value || '',
        });
      } catch (err) {
        window.alert(err?.message || 'Could not open the print dialog.');
      }
      return;
    }

    if (target.matches('[data-logout]')) {
      await logout('admin');
      currentUser = null;
      lock();
      return;
    }

    if (target.matches('[data-refresh]')) {
      await refreshFromSupabase();
      await refreshOpenTickets();
      return;
    }

    if (target.matches('[data-refresh-open-tickets]')) {
      await refreshOpenTickets();
      return;
    }

    if (target.matches('[data-refresh-purchases]')) {
      await refreshPurchases();
      return;
    }

    const addLine = target.closest('[data-add-purchase-line]');
    if (addLine) {
      const form = addLine.closest('form');
      const body = form?.querySelector('[data-purchase-lines]');
      const tpl = form?.querySelector('[data-purchase-line-tpl]');
      if (body && tpl?.content) {
        body.appendChild(tpl.content.cloneNode(true));
      } else if (body) {
        body.insertAdjacentHTML('beforeend', purchaseLineRowHtml('<option value="">Select product…</option>'));
      }
      return;
    }

    const removeLine = target.closest('[data-remove-purchase-line]');
    if (removeLine) {
      const body = removeLine.closest('[data-purchase-lines]');
      const row = removeLine.closest('tr');
      if (body && row && body.querySelectorAll('tr').length > 1) {
        row.remove();
      }
      return;
    }

    const voidOpen = target.closest('[data-void-open-ticket]');
    if (voidOpen) {
      const id = voidOpen.dataset.voidOpenTicket;
      if (!confirm('Void this open POS ticket?')) return;
      try {
        await cancelOpenTicket(id);
        await refreshOpenTickets();
      } catch (err) {
        window.alert(err?.message || 'Failed to void open ticket.');
      }
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
      let id = '';
      try {
        id = assertLiveId(readRowId(deleteCollection, 'deleteCollection'), 'Collection');
      } catch (err) {
        window.alert(err.message);
        await refreshFromSupabase();
        return;
      }

      const item = state.getSnapshot().managedCollections?.find((c) => c.id === id)
        || state.getSnapshot().collections.find((c) => c.id === id);
      if (!item) return;
      const reassignTo = window.prompt(
        `Delete collection "${item.name}"?\nType another collection name to move its products there, or leave blank to leave them uncategorized:`,
        '',
      );
      if (reassignTo === null) return;

      try {
        await persistDeleteCollection(id, reassignTo.trim());
        await refreshFromSupabase();
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
      let id = '';
      try {
        id = assertLiveId(readRowId(deleteCategory, 'deleteCategory'), 'Category');
      } catch (err) {
        window.alert(err.message);
        await refreshFromSupabase();
        return;
      }

      const item = state.getSnapshot().managedCategories?.find((c) => c.id === id)
        || state.getSnapshot().categories.find((c) => c.id === id);
      if (!item) return;
      const reassignTo = window.prompt(
        `Delete category "${item.name}"?\nType another category name to move its products there, or leave blank to leave them uncategorized:`,
        '',
      );
      if (reassignTo === null) return;

      try {
        await persistDeleteCategory(id, reassignTo.trim());
        await refreshFromSupabase();
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
      let id = '';
      try {
        id = assertLiveId(readRowId(deleteCatalog, 'deleteCatalog'), 'Product');
      } catch (err) {
        window.alert(err.message);
        await refreshFromSupabase();
        return;
      }

      if (confirm('Remove this product from the website store?')) {
        try {
          await persistDeleteProduct(id);
          await refreshFromSupabase();
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
      let id = '';
      try {
        id = assertLiveId(readRowId(deleteBtn, 'deleteProduct'), 'Product');
      } catch (err) {
        window.alert(err.message);
        await refreshFromSupabase();
        return;
      }

      if (confirm('Delete this product from the master inventory?')) {
        try {
          await persistDeleteProduct(id);
          await refreshFromSupabase();
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
        await persistUpsertCollection({
          id: String(data.get('id') || ''),
          name: String(data.get('name') || '').trim(),
          description: String(data.get('description') || '').trim(),
        }, String(data.get('renameFrom') || ''));
        await refreshFromSupabase();
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
        await persistUpsertCategory({
          id: String(data.get('id') || ''),
          name: String(data.get('name') || '').trim(),
          description: String(data.get('description') || '').trim(),
        }, String(data.get('renameFrom') || ''));
        await refreshFromSupabase();
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

    const purchaseForm = event.target.closest('[data-purchase-form]');
    if (purchaseForm) {
      event.preventDefault();
      await savePurchaseFromForm(purchaseForm);
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

    const snapshot = state.getSnapshot();
    const managedCollections = snapshot.managedCollections?.length
      ? snapshot.managedCollections
      : snapshot.collections;
    const managedCategories = snapshot.managedCategories?.length
      ? snapshot.managedCategories
      : snapshot.categories;

    const collectionId = String(data.get('collection_id') || '').trim();
    const categoryId = String(data.get('category_id') || '').trim();

    if (!isLiveDbId(collectionId) || !isLiveDbId(categoryId)) {
      window.alert('Please create a Collection and Category first, then select them from the dropdowns.');
      return;
    }

    const collectionName = managedCollections.find((c) => c.id === collectionId)?.name || '';
    const category = managedCategories.find((c) => c.id === categoryId)?.name || '';

    const product = {
      id: isLiveDbId(data.get('id')) ? String(data.get('id')) : undefined,
      title: String(data.get('title')),
      collection_id: collectionId,
      category_id: categoryId,
      collectionName,
      category,
      costPrice: Number(data.get('costPrice')),
      retailPrice: Number(data.get('retailPrice')),
      stockQuantity: Number(data.get('stockQuantity')),
      barcode: String(data.get('barcode')),
      imageUrls,
    };

    try {
      await persistUpsertProduct(product);
      await refreshFromSupabase();
    } catch (err) {
      console.error('[admin] upsertProduct failed:', err);
      window.alert(err?.message || 'Failed to save product to Supabase.');
    }
  }

  /**
   * Rebuild Collection / Category <select> options from live Supabase rows.
   * @param {Array<{ id: string, name: string }>} collections
   * @param {Array<{ id: string, name: string }>} categories
   * @param {HTMLElement} [scope]
   * @param {{ collectionId?: string, categoryId?: string }} [selected]
   */
  function updateBarcodePreview(form) {
    if (!form) return;
    const input = form.querySelector('[data-barcode-input]');
    const host = form.querySelector('[data-barcode-preview]');
    if (!host) return;
    const value = String(input?.value ?? '').trim();
    if (!value) {
      host.innerHTML = '';
      return;
    }
    try {
      renderBarcodeInto(host, value);
    } catch (err) {
      host.innerHTML = `<span class="dash-barcode-error">${escapeHtml(err?.message || 'Invalid barcode')}</span>`;
    }
  }

  function populateFormDropdowns(collections, categories, scope = root, selected = {}) {
    const liveCollections = (collections || []).filter((c) => isLiveDbId(c.id) && c.name);
    const liveCategories = (categories || []).filter((c) => isLiveDbId(c.id) && c.name);

    scope.querySelectorAll('[data-collection-select]').forEach((select) => {
      const current = selected.collectionId || select.value || '';
      select.innerHTML = '';
      if (!liveCollections.length) {
        select.disabled = true;
        select.required = false;
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'Please create a Collection first';
        select.appendChild(opt);
        return;
      }

      select.disabled = false;
      select.required = true;
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.disabled = true;
      placeholder.textContent = 'Select…';
      if (!liveCollections.some((c) => c.id === current)) placeholder.selected = true;
      select.appendChild(placeholder);

      liveCollections.forEach((c) => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.name;
        if (c.id === current) opt.selected = true;
        select.appendChild(opt);
      });
    });

    scope.querySelectorAll('[data-category-select]').forEach((select) => {
      const current = selected.categoryId || select.value || '';
      select.innerHTML = '';
      if (!liveCategories.length) {
        select.disabled = true;
        select.required = false;
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'Please create a Category first';
        select.appendChild(opt);
        return;
      }

      select.disabled = false;
      select.required = true;
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.disabled = true;
      placeholder.textContent = 'Select…';
      if (!liveCategories.some((c) => c.id === current)) placeholder.selected = true;
      select.appendChild(placeholder);

      liveCategories.forEach((c) => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.name;
        if (c.id === current) opt.selected = true;
        select.appendChild(opt);
      });
    });
  }

  function liveTaxonomy(snapshot = state.getSnapshot()) {
    const collections = (snapshot.managedCollections?.length
      ? snapshot.managedCollections
      : snapshot.collections || []
    ).filter((c) => isLiveDbId(c.id));
    const categories = (snapshot.managedCategories?.length
      ? snapshot.managedCategories
      : snapshot.categories || []
    ).filter((c) => isLiveDbId(c.id));
    return { collections, categories };
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
    renderPurchaseForm();
    refreshOpenTickets();
    refreshPurchases();
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
      purchases: 'Purchases — Supplier Invoices',
    };
    if (els.pageTitle) els.pageTitle.textContent = titles[view] ?? 'Main Dashboard';
  }

  function renderForm(product = null) {
    if (!els.formHost) return;
    const snapshot = state.getSnapshot();
    const editing = product ?? (editingProductId
      ? snapshot.products.find((p) => p.id === editingProductId)
      : null);
    const { collections, categories } = liveTaxonomy(snapshot);

    if (els.formTitle) {
      els.formTitle.textContent = editing ? 'Edit Product' : 'Add Product';
    }
    els.formHost.innerHTML = productFormHtml(editing, collections, categories);
    const form = els.formHost.querySelector('[data-product-form]');
    if (form) {
      bindImageUploader(form);
      populateFormDropdowns(collections, categories, form, {
        collectionId: editing?.collection_id || '',
        categoryId: editing?.category_id || '',
      });
      updateBarcodePreview(form);
    }
  }

  function renderCatalogForm(product = null) {
    if (!els.catalogFormHost) return;
    const snapshot = state.getSnapshot();
    const editing = product ?? (editingCatalogId
      ? snapshot.products.find((p) => p.id === editingCatalogId)
      : null);
    const { collections, categories } = liveTaxonomy(snapshot);

    if (els.catalogFormTitle) {
      els.catalogFormTitle.textContent = editing ? 'Edit Store Product' : 'Add Store Product';
    }
    els.catalogFormHost.innerHTML = catalogFormHtml(editing, collections, categories);
    const form = els.catalogFormHost.querySelector('[data-catalog-form]');
    if (form) {
      bindImageUploader(form);
      populateFormDropdowns(collections, categories, form, {
        collectionId: editing?.collection_id || '',
        categoryId: editing?.category_id || '',
      });
      updateBarcodePreview(form);
    }
  }

  function renderPurchaseForm() {
    if (!els.purchaseFormHost) return;
    const products = state.getSnapshot().products.filter((p) => isLiveDbId(p.id));
    els.purchaseFormHost.innerHTML = purchaseFormHtml(products);
  }

  async function refreshPurchases() {
    if (!els.purchasesHost) return;
    if (!isSupabaseReady()) {
      els.purchasesHost.innerHTML = '<p class="dash-empty">Supabase not configured — purchases unavailable.</p>';
      return;
    }
    try {
      const rows = await getSupplierInvoices();
      els.purchasesHost.innerHTML = supplierInvoicesTableHtml(rows);
    } catch (err) {
      console.error('[admin] purchases load failed:', err);
      els.purchasesHost.innerHTML = `<p class="dash-empty">${escapeHtml(err?.message || 'Failed to load purchases.')}</p>`;
    }
  }

  async function savePurchaseFromForm(form) {
    const data = new FormData(form);
    const productIds = data.getAll('product_id[]');
    const unitPrices = data.getAll('supplier_unit_price[]');
    const quantities = data.getAll('quantity[]');

    const lineItems = productIds.map((pid, i) => ({
      product_id: String(pid || '').trim(),
      supplier_unit_price: Number(unitPrices[i]) || 0,
      quantity: Number(quantities[i]) || 0,
    })).filter((l) => l.product_id && l.quantity > 0);

    if (!lineItems.length) {
      window.alert('Add at least one product line with a quantity.');
      return;
    }

    const invoiceData = {
      supplier_name: String(data.get('supplier_name') || '').trim(),
      invoice_number: String(data.get('invoice_number') || '').trim(),
      invoice_date: String(data.get('invoice_date') || '').trim(),
      currency: String(data.get('currency') || 'LYD').trim(),
      total_shipping_transport_cost: Number(data.get('total_shipping_transport_cost')) || 0,
      total_customs_duties_cost: Number(data.get('total_customs_duties_cost')) || 0,
      notes: String(data.get('notes') || '').trim(),
    };

    const submitBtn = form.querySelector('[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;
    try {
      await createSupplierInvoice(invoiceData, lineItems);
      window.alert('Purchase invoice saved. Landed costs allocated and stock updated.');
      await refreshFromSupabase();
      await refreshPurchases();
      renderPurchaseForm();
    } catch (err) {
      console.error('[admin] savePurchase failed:', err);
      window.alert(err?.message || 'Failed to save purchase invoice.');
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  function renderCollectionForm() {
    if (!els.collectionFormHost) return;
    const snapshot = state.getSnapshot();
    const pool = snapshot.managedCollections?.length
      ? snapshot.managedCollections
      : snapshot.collections;
    const item = editingCollectionId
      ? pool.find((c) => c.id === editingCollectionId)
      : null;
    els.collectionFormHost.innerHTML = collectionFormHtml(item);
  }

  function renderCategoryForm() {
    if (!els.categoryFormHost) return;
    const snapshot = state.getSnapshot();
    const pool = snapshot.managedCategories?.length
      ? snapshot.managedCategories
      : snapshot.categories;
    const item = editingCategoryId
      ? pool.find((c) => c.id === editingCategoryId)
      : null;
    els.categoryFormHost.innerHTML = categoryFormHtml(item);
  }

  function renderTaxonomyForms() {
    renderCollectionForm();
    renderCategoryForm();
  }

  function renderCatalog(snapshot) {
    const { products, collections, categories, managedCollections = [], managedCategories = [] } = snapshot;

    const collectionRows = (managedCollections.length ? managedCollections : collections)
      .filter((c) => isLiveDbId(c.id))
      .map((c) => ({
        ...c,
        count: products.filter((p) => p.collectionName === c.name).length,
      }));

    const categoryRows = (managedCategories.length ? managedCategories : categories)
      .filter((c) => isLiveDbId(c.id))
      .map((c) => ({
        ...c,
        count: products.filter((p) => p.category === c.name).length,
      }));

    if (els.collectionsHost) {
      els.collectionsHost.innerHTML = collectionsPanelHtml(collectionRows);
    }

    if (els.categoriesHost) {
      els.categoriesHost.innerHTML = categoriesPanelHtml(categoryRows);
    }

    if (els.collectionCount) {
      els.collectionCount.textContent = `${collectionRows.length} collection${collectionRows.length === 1 ? '' : 's'}`;
    }

    if (els.categoryCount) {
      els.categoryCount.textContent = `${categoryRows.length} categor${categoryRows.length === 1 ? 'y' : 'ies'}`;
    }

    if (els.catalogFilter) {
      const liveFilters = collectionRows;
      if (catalogFilter !== 'All' && !liveFilters.some((c) => c.name === catalogFilter)) {
        catalogFilter = 'All';
      }
      const current = catalogFilter;

      if (!liveFilters.length) {
        els.catalogFilter.innerHTML = `
          <option value="All" selected>All collections</option>
          <option value="" disabled>Please create a Collection first</option>
        `;
      } else {
        els.catalogFilter.innerHTML = `
          <option value="All"${current === 'All' ? ' selected' : ''}>All collections</option>
          ${liveFilters.map((c) => `
            <option value="${escapeAttr(c.name)}"${c.name === current ? ' selected' : ''}>${escapeHtml(c.name)}</option>
          `).join('')}
        `;
      }
    }

    if (els.catalogHost) {
      els.catalogHost.innerHTML = catalogTableHtml(
        products.filter((p) => isLiveDbId(p.id)),
        catalogFilter,
      );
    }

    if (els.catalogCount) {
      const liveProducts = products.filter((p) => isLiveDbId(p.id));
      const count = catalogFilter === 'All'
        ? liveProducts.length
        : liveProducts.filter((p) => p.collectionName === catalogFilter).length;
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
      els.inventoryHost.innerHTML = inventoryTableHtml(products.filter((p) => isLiveDbId(p.id)));
    }

    if (els.productCount) {
      const liveCount = products.filter((p) => isLiveDbId(p.id)).length;
      els.productCount.textContent = `${liveCount} product${liveCount === 1 ? '' : 's'}`;
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
