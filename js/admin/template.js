/**
 * Admin dashboard HTML templates — semantic panel blocks.
 */
import { imageUploaderHtml } from './image-upload.js';

/**
 * @param {{ online: object, pos: object }} ledgers
 * @param {Array} metrics
 */
export function ledgerMatrixHtml(ledgers, metrics) {
  return `
    <div class="dash-ledgers" role="region" aria-label="Comparative financial matrices">
      ${ledgerPanelHtml('online', '🌐 Online Storefront Ledger', ledgers.online, metrics)}
      ${ledgerPanelHtml('pos', '🏬 In-Store POS Ledger', ledgers.pos, metrics)}
    </div>
  `;
}

function ledgerPanelHtml(channel, title, ledger, metrics) {
  return `
    <article class="dash-ledger" data-ledger="${channel}">
      <header class="dash-ledger__header">
        <h2 class="dash-ledger__title">${title}</h2>
        <span class="dash-ledger__badge" data-ledger-badge="${channel}">Live</span>
      </header>
      <div class="dash-ledger__grid" role="list">
        ${metrics.map((m) => `
          <div class="dash-metric${m.tone ? ` dash-metric--${m.tone}` : ''}" role="listitem">
            <p class="dash-metric__label">${m.label}</p>
            <p class="dash-metric__value" data-metric="${channel}-${m.key}">${m.format(ledger[m.key])}</p>
          </div>
        `).join('')}
      </div>
    </article>
  `;
}

/**
 * @param {import('../dashboard.js').ProductRecord[]} products
 * @param {string} [filterCollection]
 */
export function catalogTableHtml(products, filterCollection = 'All') {
  const filtered = filterCollection && filterCollection !== 'All'
    ? products.filter((p) => p.collectionName === filterCollection)
    : products;

  if (!filtered.length) {
    return '<p class="dash-empty">No products yet. Add a product to publish it on the website.</p>';
  }

  return `
    <div class="dash-table-wrap">
      <table class="dash-table" data-catalog-table>
        <thead>
          <tr>
            <th scope="col">Product</th>
            <th scope="col">Collection</th>
            <th scope="col">Category</th>
            <th scope="col">Retail (سعر البيع)</th>
            <th scope="col">Stock</th>
            <th scope="col">Barcode</th>
            <th scope="col">On Website</th>
            <th scope="col"><span class="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          ${filtered.map((p) => catalogRowHtml(p)).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function catalogRowHtml(product) {
  const thumb = product.imageUrls[0]
    ? `<img src="${escapeAttr(product.imageUrls[0])}" alt="" class="dash-table__thumb" loading="lazy">`
    : `<span class="dash-table__thumb dash-table__thumb--placeholder" aria-hidden="true">${escapeHtml(product.title.charAt(0))}</span>`;

  return `
    <tr data-id="${escapeAttr(product.id)}" data-product-row="${escapeAttr(product.id)}">
      <td>
        <div class="dash-table__product">
          ${thumb}
          <div>
            <span class="dash-table__title">${escapeHtml(product.title)}</span>
            <span class="dash-table__sub">${product.imageUrls.length} image${product.imageUrls.length === 1 ? '' : 's'}</span>
          </div>
        </div>
      </td>
      <td><span class="dash-chip">${escapeHtml(product.collectionName)}</span></td>
      <td><span class="dash-chip dash-chip--muted">${escapeHtml(product.category || product.collectionName)}</span></td>
      <td class="dash-table__num">${formatNum(product.retailPrice)} LYD</td>
      <td class="dash-table__num${product.stockQuantity <= 5 ? ' dash-table__num--low' : ''}">${product.stockQuantity}</td>
      <td><code class="dash-barcode">${escapeHtml(product.barcode)}</code></td>
      <td><span class="dash-status dash-status--live">Live</span></td>
      <td>
        <div class="dash-table__actions">
          <button type="button" class="dash-btn dash-btn--ghost dash-btn--sm" data-edit-catalog="${escapeAttr(product.id)}">Edit</button>
          <button type="button" class="dash-btn dash-btn--danger dash-btn--sm" data-id="${escapeAttr(product.id)}" data-delete-catalog="${escapeAttr(product.id)}">Remove</button>
        </div>
      </td>
    </tr>
  `;
}

/**
 * @param {Array<{ id: string, name: string, count: number, description?: string }>} collections
 */
export function collectionsPanelHtml(collections) {
  if (!collections.length) {
    return '<p class="dash-empty">No collections yet. Add one below.</p>';
  }

  return `
    <div class="dash-taxonomy-list" data-taxonomy-list="collections">
      ${collections.map((c) => `
        <div class="dash-taxonomy-row" data-id="${escapeAttr(c.id)}" data-collection-id="${escapeAttr(c.id)}">
          <div class="dash-taxonomy-row__main">
            <button type="button" class="dash-collection-card" data-filter-collection="${escapeAttr(c.name)}">
              <span class="dash-collection-card__name">${escapeHtml(c.name)}</span>
              <span class="dash-collection-card__count">${c.count} product${c.count === 1 ? '' : 's'}</span>
            </button>
          </div>
          <div class="dash-taxonomy-row__actions">
            <button type="button" class="dash-btn dash-btn--ghost dash-btn--sm" data-edit-collection="${escapeAttr(c.id)}">Edit</button>
            <button type="button" class="dash-btn dash-btn--danger dash-btn--sm" data-id="${escapeAttr(c.id)}" data-delete-collection="${escapeAttr(c.id)}">Delete</button>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

/**
 * @param {Array<{ id: string, name: string, count: number }>} categories
 */
export function categoriesPanelHtml(categories) {
  if (!categories.length) {
    return '<p class="dash-empty">No categories yet. Add one below.</p>';
  }

  return `
    <div class="dash-taxonomy-list" data-taxonomy-list="categories">
      ${categories.map((c) => `
        <div class="dash-taxonomy-row" data-id="${escapeAttr(c.id)}" data-category-id="${escapeAttr(c.id)}">
          <div class="dash-taxonomy-row__main">
            <span class="dash-chip">${escapeHtml(c.name)}</span>
            <span class="dash-taxonomy-row__count">${c.count} product${c.count === 1 ? '' : 's'}</span>
          </div>
          <div class="dash-taxonomy-row__actions">
            <button type="button" class="dash-btn dash-btn--ghost dash-btn--sm" data-edit-category="${escapeAttr(c.id)}">Edit</button>
            <button type="button" class="dash-btn dash-btn--danger dash-btn--sm" data-id="${escapeAttr(c.id)}" data-delete-category="${escapeAttr(c.id)}">Delete</button>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

/**
 * @param {{ id?: string, name?: string, description?: string } | null} item
 */
export function collectionFormHtml(item = null) {
  const isEdit = Boolean(item?.id || item?.name);
  return `
    <form class="dash-form dash-form--compact" data-collection-form autocomplete="off">
      <input type="hidden" name="id" value="${escapeAttr(item?.id ?? '')}">
      <input type="hidden" name="renameFrom" value="${escapeAttr(item?.name ?? '')}">
      <div class="dash-form__grid">
        <div class="dash-field dash-field--full">
          <label for="collection-name">Collection name</label>
          <input id="collection-name" name="name" type="text" required value="${escapeAttr(item?.name ?? '')}" placeholder="Candles">
        </div>
        <div class="dash-field dash-field--full">
          <label for="collection-desc">Description <span class="dash-field__hint">(optional)</span></label>
          <input id="collection-desc" name="description" type="text" value="${escapeAttr(item?.description ?? '')}" placeholder="Shown on website collection cards">
        </div>
      </div>
      <div class="dash-form__actions">
        <button type="submit" class="dash-btn dash-btn--primary dash-btn--sm">${isEdit ? 'Save Collection' : 'Add Collection'}</button>
        ${isEdit ? '<button type="button" class="dash-btn dash-btn--ghost dash-btn--sm" data-cancel-collection-edit>Cancel</button>' : ''}
      </div>
    </form>
  `;
}

/**
 * @param {{ id?: string, name?: string, description?: string } | null} item
 */
export function categoryFormHtml(item = null) {
  const isEdit = Boolean(item?.id || item?.name);
  return `
    <form class="dash-form dash-form--compact" data-category-form autocomplete="off">
      <input type="hidden" name="id" value="${escapeAttr(item?.id ?? '')}">
      <input type="hidden" name="renameFrom" value="${escapeAttr(item?.name ?? '')}">
      <div class="dash-form__grid">
        <div class="dash-field dash-field--full">
          <label for="category-name">Category name</label>
          <input id="category-name" name="name" type="text" required value="${escapeAttr(item?.name ?? '')}" placeholder="Oils">
        </div>
        <div class="dash-field dash-field--full">
          <label for="category-desc">Description <span class="dash-field__hint">(optional)</span></label>
          <input id="category-desc" name="description" type="text" value="${escapeAttr(item?.description ?? '')}" placeholder="Used for filters & POS chips">
        </div>
      </div>
      <div class="dash-form__actions">
        <button type="submit" class="dash-btn dash-btn--primary dash-btn--sm">${isEdit ? 'Save Category' : 'Add Category'}</button>
        ${isEdit ? '<button type="button" class="dash-btn dash-btn--ghost dash-btn--sm" data-cancel-category-edit>Cancel</button>' : ''}
      </div>
    </form>
  `;
}

/**
 * @param {import('../dashboard.js').ProductRecord | null} product
 * @param {Array<{ id: string, name: string }>} [collections]
 * @param {Array<{ id: string, name: string }>} [categories]
 */
export function catalogFormHtml(product = null, collections = [], categories = []) {
  const isEdit = Boolean(product);
  const liveCollections = (collections || []).filter((c) => c?.id && c?.name);
  const liveCategories = (categories || []).filter((c) => c?.id && c?.name);
  const selectedCollectionId = product?.collection_id || '';
  const selectedCategoryId = product?.category_id || '';

  return `
    <form class="dash-form" data-catalog-form autocomplete="off">
      <input type="hidden" name="id" value="${escapeAttr(product?.id ?? '')}">

      <div class="dash-form__grid">
        <div class="dash-field dash-field--full">
          <label for="cat-title">Product Title</label>
          <input id="cat-title" name="title" type="text" required value="${escapeAttr(product?.title ?? '')}" placeholder="Oud Noir Candle">
        </div>
        <div class="dash-field">
          <label for="cat-collection">Collection</label>
          <select id="cat-collection" name="collection_id" data-collection-select required ${liveCollections.length ? '' : 'disabled'}>
            ${taxonomySelectOptionsHtml(liveCollections, selectedCollectionId, 'Please create a Collection first')}
          </select>
        </div>
        <div class="dash-field">
          <label for="cat-category">Category</label>
          <select id="cat-category" name="category_id" data-category-select required ${liveCategories.length ? '' : 'disabled'}>
            ${taxonomySelectOptionsHtml(liveCategories, selectedCategoryId, 'Please create a Category first')}
          </select>
        </div>
        <div class="dash-field">
          <label for="cat-barcode">Barcode / SKU</label>
          <input id="cat-barcode" name="barcode" type="text" required value="${escapeAttr(product?.barcode ?? '')}" placeholder="6281001001001">
        </div>
        <div class="dash-field">
          <label for="cat-retail">Retail Price <span lang="ar">سعر البيع</span></label>
          <input id="cat-retail" name="retailPrice" type="number" min="0" step="0.01" required value="${product?.retailPrice ?? ''}" placeholder="48.00">
        </div>
        <div class="dash-field">
          <label for="cat-cost">Cost Price <span lang="ar">سعر التكلفة</span></label>
          <input id="cat-cost" name="costPrice" type="number" min="0" step="0.01" required value="${product?.costPrice ?? ''}" placeholder="18.00">
        </div>
        <div class="dash-field">
          <label for="cat-stock">Stock Quantity</label>
          <input id="cat-stock" name="stockQuantity" type="number" min="0" step="1" required value="${product?.stockQuantity ?? ''}" placeholder="24">
        </div>
      </div>

      ${imageUploaderHtml(product?.imageUrls ?? [], 'cat-images')}

      <div class="dash-form__actions">
        <button type="submit" class="dash-btn dash-btn--primary" ${liveCollections.length && liveCategories.length ? '' : 'disabled'}>${isEdit ? 'Save & Publish' : 'Add to Website'}</button>
        ${isEdit ? '<button type="button" class="dash-btn dash-btn--ghost" data-cancel-catalog-edit>Cancel</button>' : ''}
      </div>
      <p class="dash-form__note">${liveCollections.length && liveCategories.length
    ? 'Saving publishes this product to the online store and POS catalog.'
    : 'Create at least one Collection and one Category under “Collections &amp; Categories” before adding products.'}</p>
    </form>
  `;
}

/**
 * @param {Array<{ id: string, name: string }>} items
 * @param {string} selectedId
 * @param {string} emptyLabel
 */
function taxonomySelectOptionsHtml(items, selectedId = '', emptyLabel = 'None available') {
  if (!items.length) {
    return `<option value="">${escapeHtml(emptyLabel)}</option>`;
  }

  const hasSelected = items.some((item) => String(item.id) === String(selectedId));
  return `
    <option value="" disabled ${hasSelected ? '' : 'selected'}>Select…</option>
    ${items.map((item) => `
      <option value="${escapeAttr(item.id)}"${String(item.id) === String(selectedId) ? ' selected' : ''}>${escapeHtml(item.name)}</option>
    `).join('')}
  `;
}

/**
 * @param {import('../dashboard.js').ProductRecord[]} products
 */
export function inventoryTableHtml(products) {
  if (!products.length) {
    return '<p class="dash-empty">No products in inventory. Add your first record below.</p>';
  }

  return `
    <div class="dash-table-wrap">
      <table class="dash-table" data-inventory-table>
        <thead>
          <tr>
            <th scope="col">Product</th>
            <th scope="col">Collection</th>
            <th scope="col">Cost (سعر التكلفة)</th>
            <th scope="col">Retail (سعر البيع)</th>
            <th scope="col">Stock</th>
            <th scope="col">Barcode</th>
            <th scope="col">Images</th>
            <th scope="col"><span class="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          ${products.map((p) => inventoryRowHtml(p)).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function inventoryRowHtml(product) {
  const thumb = product.imageUrls[0]
    ? `<img src="${escapeAttr(product.imageUrls[0])}" alt="" class="dash-table__thumb" loading="lazy">`
    : `<span class="dash-table__thumb dash-table__thumb--placeholder" aria-hidden="true">${escapeHtml(product.title.charAt(0))}</span>`;

  return `
    <tr data-id="${escapeAttr(product.id)}" data-product-row="${escapeAttr(product.id)}">
      <td>
        <div class="dash-table__product">
          ${thumb}
          <span>${escapeHtml(product.title)}</span>
        </div>
      </td>
      <td>${escapeHtml(product.collectionName)}</td>
      <td class="dash-table__num" data-field="cost">${formatNum(product.costPrice)}</td>
      <td class="dash-table__num" data-field="retail">${formatNum(product.retailPrice)}</td>
      <td class="dash-table__num${product.stockQuantity <= 5 ? ' dash-table__num--low' : ''}" data-field="stock">${product.stockQuantity}</td>
      <td><code class="dash-barcode">${escapeHtml(product.barcode)}</code></td>
      <td class="dash-table__num">${product.imageUrls.length}</td>
      <td>
        <div class="dash-table__actions">
          <button type="button" class="dash-btn dash-btn--ghost dash-btn--sm" data-edit-product="${escapeAttr(product.id)}">Edit</button>
          <button type="button" class="dash-btn dash-btn--danger dash-btn--sm" data-id="${escapeAttr(product.id)}" data-delete-product="${escapeAttr(product.id)}">Delete</button>
        </div>
      </td>
    </tr>
  `;
}

/**
 * @param {import('../dashboard.js').Transaction[]} transactions
 */
export function transactionFeedHtml(transactions) {
  const recent = transactions.slice(0, 8);

  if (!recent.length) {
    return '<p class="dash-empty">No transactions recorded yet.</p>';
  }

  return `
    <ol class="dash-feed" data-transaction-feed>
      ${recent.map((tx) => `
        <li class="dash-feed__item" data-channel="${tx.channel}">
          <div class="dash-feed__meta">
            <span class="dash-feed__channel">${tx.channel === 'online' ? '🌐 Online' : '🏬 POS'}</span>
            <time datetime="${tx.timestamp}">${formatTime(tx.timestamp)}</time>
          </div>
          <p class="dash-feed__detail">
            ${tx.lines.length} line(s) · ${formatLyd(tx.grossRevenue)} revenue
            · margin ${formatLyd(tx.netProfit)}
            ${tx.staffName ? ` · ${escapeHtml(tx.staffName)}` : ''}
          </p>
        </li>
      `).join('')}
    </ol>
  `;
}

/**
 * Open / parked POS tickets from Supabase (linked to register).
 * @param {Array<object>} tickets
 */
export function openTicketsPanelHtml(tickets = []) {
  if (!tickets.length) {
    return '<p class="dash-empty">No open POS tickets. Park a ticket on the register to see it here.</p>';
  }

  return `
    <ul class="dash-open-tickets">
      ${tickets.map((t) => {
        const lines = t.order_items || [];
        const qty = lines.reduce((sum, line) => sum + Number(line.quantity || 0), 0);
        const when = t.parked_at || t.created_at;
        return `
          <li class="dash-open-tickets__item" data-open-ticket-id="${escapeAttr(t.id)}">
            <div>
              <p class="dash-open-tickets__title">${escapeHtml(t.ticket_label || `Ticket ${String(t.id).slice(0, 8)}`)}</p>
              <p class="dash-open-tickets__meta">
                ${qty} item${qty === 1 ? '' : 's'} · ${formatLyd(Number(t.total_amount || 0))}
                · ${escapeHtml(t.staff_name || 'Staff')}
                ${when ? ` · ${escapeHtml(new Date(when).toLocaleString('en-LY'))}` : ''}
              </p>
              <ul class="dash-open-tickets__lines">
                ${lines.slice(0, 4).map((line) => `
                  <li>${escapeHtml(line.product_name || 'Item')} × ${Number(line.quantity || 0)}</li>
                `).join('')}
                ${lines.length > 4 ? `<li>+${lines.length - 4} more</li>` : ''}
              </ul>
            </div>
            <button type="button" class="dash-btn dash-btn--danger dash-btn--sm" data-void-open-ticket="${escapeAttr(t.id)}">Void</button>
          </li>
        `;
      }).join('')}
    </ul>
  `;
}

/**
 * @param {import('../dashboard.js').ProductRecord | null} product
 * @param {Array<{ id: string, name: string }>} [collections]
 * @param {Array<{ id: string, name: string }>} [categories]
 */
export function productFormHtml(product = null, collections = [], categories = []) {
  const isEdit = Boolean(product);
  const liveCollections = (collections || []).filter((c) => c?.id && c?.name);
  const liveCategories = (categories || []).filter((c) => c?.id && c?.name);
  const selectedCollectionId = product?.collection_id || '';
  const selectedCategoryId = product?.category_id || '';

  return `
    <form class="dash-form" data-product-form autocomplete="off">
      <input type="hidden" name="id" value="${escapeAttr(product?.id ?? '')}">

      <div class="dash-form__grid">
        <div class="dash-field">
          <label for="product-title">Product Title</label>
          <input id="product-title" name="title" type="text" required value="${escapeAttr(product?.title ?? '')}" placeholder="Oud Noir Candle">
        </div>
        <div class="dash-field">
          <label for="product-collection">Collection</label>
          <select id="product-collection" name="collection_id" data-collection-select required ${liveCollections.length ? '' : 'disabled'}>
            ${taxonomySelectOptionsHtml(liveCollections, selectedCollectionId, 'Please create a Collection first')}
          </select>
        </div>
        <div class="dash-field">
          <label for="product-category">Category</label>
          <select id="product-category" name="category_id" data-category-select required ${liveCategories.length ? '' : 'disabled'}>
            ${taxonomySelectOptionsHtml(liveCategories, selectedCategoryId, 'Please create a Category first')}
          </select>
        </div>
        <div class="dash-field">
          <label for="product-cost">Cost Price <span lang="ar">سعر التكلفة</span></label>
          <input id="product-cost" name="costPrice" type="number" min="0" step="0.01" required value="${product?.costPrice ?? ''}" placeholder="18.00">
        </div>
        <div class="dash-field">
          <label for="product-retail">Retail Price <span lang="ar">سعر البيع</span></label>
          <input id="product-retail" name="retailPrice" type="number" min="0" step="0.01" required value="${product?.retailPrice ?? ''}" placeholder="48.00">
        </div>
        <div class="dash-field">
          <label for="product-stock">Stock Quantity</label>
          <input id="product-stock" name="stockQuantity" type="number" min="0" step="1" required value="${product?.stockQuantity ?? ''}" placeholder="24">
        </div>
        <div class="dash-field">
          <label for="product-barcode">Barcode String</label>
          <input id="product-barcode" name="barcode" type="text" required value="${escapeAttr(product?.barcode ?? '')}" placeholder="6281001001001">
        </div>
      </div>

      ${imageUploaderHtml(product?.imageUrls ?? [], 'product-images')}

      <div class="dash-form__actions">
        <button type="submit" class="dash-btn dash-btn--primary" ${liveCollections.length && liveCategories.length ? '' : 'disabled'}>${isEdit ? 'Save Changes' : 'Add Product'}</button>
        ${isEdit ? '<button type="button" class="dash-btn dash-btn--ghost" data-cancel-edit>Cancel</button>' : ''}
      </div>
    </form>
  `;
}

export function authGateHtml() {
  return `
    <div class="dash-auth" data-auth-gate>
      <form class="dash-auth__card" data-auth-form autocomplete="on">
        <div class="dash-auth__brand">
          <span class="dash-auth__logo" aria-hidden="true">◈</span>
          <h1>Shamaadan Admin</h1>
          <p>Secure Accounting Suite</p>
          <p class="dash-auth__note">Username &amp; password required. POS uses a separate staff PIN.</p>
        </div>
        <div class="dash-field">
          <label for="admin-username">Username</label>
          <input id="admin-username" name="username" type="text" autocomplete="username" required placeholder="admin" spellcheck="false">
        </div>
        <div class="dash-field">
          <label for="admin-password">Password</label>
          <input id="admin-password" name="password" type="password" autocomplete="current-password" required placeholder="••••••••">
        </div>
        <p class="dash-auth__error" data-auth-error hidden></p>
        <button type="submit" class="dash-btn dash-btn--primary dash-btn--full" data-auth-submit>Sign in</button>
        <p class="dash-auth__hint">Demo: <code>admin</code> / <code>shamaadan</code></p>
        <p class="dash-auth__hint"><a href="/?app=pos">Open POS register →</a></p>
      </form>
    </div>
  `;
}

export function buildAdminShell() {
  return `
    ${authGateHtml()}
    <div class="dash-app" data-dash-app hidden>
      <aside class="dash-sidebar" aria-label="Admin navigation">
        <div class="dash-sidebar__brand">
          <span class="dash-sidebar__mark" aria-hidden="true">◈</span>
          <div>
            <p class="dash-sidebar__name">Shamaadan</p>
            <p class="dash-sidebar__sub">Central Dashboard</p>
          </div>
        </div>
        <nav class="dash-nav">
          <button type="button" class="dash-nav__link is-active" data-view="dashboard" aria-current="page">
            <span aria-hidden="true">📊</span> Accounting
          </button>
          <button type="button" class="dash-nav__link" data-view="catalog">
            <span aria-hidden="true">🛍</span> Store Catalog
          </button>
          <button type="button" class="dash-nav__link" data-view="taxonomy">
            <span aria-hidden="true">🏷</span> Collections &amp; Categories
          </button>
          <button type="button" class="dash-nav__link" data-view="inventory">
            <span aria-hidden="true">📦</span> Inventory Costs
          </button>
          <a href="/?app=storefront" class="dash-nav__link dash-nav__link--external" target="_blank" rel="noopener">
            <span aria-hidden="true">🌐</span> View Website
          </a>
          <a href="/?app=pos" class="dash-nav__link dash-nav__link--external">
            <span aria-hidden="true">🏬</span> Open POS
          </a>
        </nav>
        <footer class="dash-sidebar__footer">
          <p class="dash-sidebar__user" data-admin-user hidden></p>
          <button type="button" class="dash-btn dash-btn--ghost dash-btn--sm dash-btn--full" data-logout>Sign out</button>
        </footer>
      </aside>

      <div class="dash-main">
        <header class="dash-topbar">
          <div>
            <h1 class="dash-topbar__title" data-page-title>Accounting Dashboard</h1>
            <p class="dash-topbar__subtitle" data-last-updated>Last updated —</p>
          </div>
          <div class="dash-topbar__actions">
            <button type="button" class="dash-btn dash-btn--ghost dash-btn--sm" data-refresh>Refresh</button>
            <button type="button" class="dash-btn dash-btn--ghost dash-btn--sm" data-seed-mock>Reset Mock Data</button>
          </div>
        </header>

        <div class="dash-views">
          <section class="dash-view is-active" data-panel="dashboard" aria-label="Accounting dashboard">
            <div data-ledger-host></div>
            <div class="dash-panels-row">
              <article class="dash-panel">
                <header class="dash-panel__header">
                  <h2>Recent Transactions</h2>
                </header>
                <div class="dash-panel__body" data-transaction-host></div>
              </article>
              <article class="dash-panel">
                <header class="dash-panel__header dash-panel__header--row">
                  <h2>Open POS Tickets</h2>
                  <button type="button" class="dash-btn dash-btn--ghost dash-btn--sm" data-refresh-open-tickets>Refresh</button>
                </header>
                <div class="dash-panel__body" data-open-tickets-host>
                  <p class="dash-empty">Loading open tickets…</p>
                </div>
              </article>
            </div>
            <div class="dash-panels-row">
              <article class="dash-panel">
                <header class="dash-panel__header">
                  <h2>Margin Summary</h2>
                </header>
                <div class="dash-panel__body" data-margin-host></div>
              </article>
            </div>
          </section>

          <section class="dash-view" data-panel="catalog" aria-label="Store catalog management" hidden>
            <div class="dash-catalog-intro">
              <p>Manage products that appear on the website storefront. Add, edit, or remove items — changes sync to the shop immediately.</p>
            </div>
            <div class="dash-inventory-layout">
              <article class="dash-panel dash-panel--grow">
                <header class="dash-panel__header dash-panel__header--row">
                  <div>
                    <h2>Website Products</h2>
                    <p class="dash-panel__sub">These products show in the online store &amp; POS</p>
                  </div>
                  <div class="dash-panel__header-actions">
                    <select class="dash-select" data-catalog-filter aria-label="Filter by collection">
                      <option value="All">All collections</option>
                    </select>
                    <span class="dash-panel__count" data-catalog-count>0 products</span>
                  </div>
                </header>
                <div class="dash-panel__body" data-catalog-host></div>
              </article>
              <article class="dash-panel dash-panel--form">
                <header class="dash-panel__header">
                  <h2 data-catalog-form-title>Add Store Product</h2>
                </header>
                <div class="dash-panel__body" data-catalog-form-host></div>
              </article>
            </div>
          </section>

          <section class="dash-view" data-panel="taxonomy" aria-label="Collections and categories" hidden>
            <div class="dash-catalog-intro">
              <p>Create, rename, or delete website collections and product categories. Renaming updates linked products automatically.</p>
            </div>
            <div class="dash-taxonomy-layout">
              <article class="dash-panel">
                <header class="dash-panel__header dash-panel__header--row">
                  <h2>Collections</h2>
                  <span class="dash-panel__count" data-collection-count>0 collections</span>
                </header>
                <div class="dash-panel__body" data-collections-host></div>
                <div class="dash-panel__body dash-panel__body--form" data-collection-form-host></div>
              </article>
              <article class="dash-panel">
                <header class="dash-panel__header dash-panel__header--row">
                  <h2>Categories</h2>
                  <span class="dash-panel__count" data-category-count>0 categories</span>
                </header>
                <div class="dash-panel__body" data-categories-host></div>
                <div class="dash-panel__body dash-panel__body--form" data-category-form-host></div>
              </article>
            </div>
          </section>

          <section class="dash-view" data-panel="inventory" aria-label="Master inventory control" hidden>
            <div class="dash-inventory-layout">
              <article class="dash-panel dash-panel--grow">
                <header class="dash-panel__header dash-panel__header--row">
                  <h2>Master Inventory Ledger</h2>
                  <span class="dash-panel__count" data-product-count>0 products</span>
                </header>
                <div class="dash-panel__body" data-inventory-host></div>
              </article>
              <article class="dash-panel dash-panel--form">
                <header class="dash-panel__header">
                  <h2 data-form-title>Add Product</h2>
                </header>
                <div class="dash-panel__body" data-form-host></div>
              </article>
            </div>
          </section>
        </div>
      </div>
    </div>
  `;
}

function formatNum(n) {
  return new Intl.NumberFormat('en-LY', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function formatLyd(amount) {
  try {
    return new Intl.NumberFormat('en-LY', { style: 'currency', currency: 'LYD' }).format(amount);
  } catch {
    return `${formatNum(amount)} LYD`;
  }
}

function formatTime(iso) {
  return new Date(iso).toLocaleString('en-LY', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
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
