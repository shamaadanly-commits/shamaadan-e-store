/**
 * Admin dashboard HTML templates — semantic panel blocks.
 */
import { imageUploaderHtml } from './image-upload.js';
import { stockStatusCellHtml } from '../shared/stock-status.js';

/**
 * Barcode field with manual Generate + Print controls and a live preview.
 * The owner presses Generate to create a code (never automatic), then Print
 * to open the device print dialog.
 * @param {string} inputId
 * @param {string} barcode
 * @param {string} [label]
 */
function barcodeFieldHtml(inputId, barcode = '', label = 'Barcode') {
  return `
    <div class="dash-field dash-field--full dash-barcode-field">
      <label for="${inputId}">${label}</label>
      <div class="dash-barcode-row">
        <input id="${inputId}" name="barcode" type="text" required
          class="dash-input--bidi"
          value="${escapeAttr(barcode)}" placeholder="Scan, type, or generate"
          data-barcode-input autocomplete="off">
        <button type="button" class="dash-btn dash-btn--ghost" data-barcode-generate>Generate</button>
        <button type="button" class="dash-btn dash-btn--ghost" data-barcode-print>Print</button>
      </div>
      <div class="dash-barcode-preview" data-barcode-preview aria-live="polite"></div>
    </div>`;
}

/**
 * Checkbox: publish product on the online storefront (inventory/POS always includes it).
 * @param {import('../dashboard.js').ProductRecord | null} product
 * @param {string} inputId
 */
function pushToWebsiteFieldHtml(product = null, inputId = 'push-website') {
  const isEdit = Boolean(product);
  const checked = isEdit
    ? (product.showOnWebsite !== false && product.show_on_website !== false)
    : false;

  return `
    <div class="dash-field dash-field--full">
      <label class="dash-check" for="${escapeAttr(inputId)}">
        <input
          type="checkbox"
          id="${escapeAttr(inputId)}"
          name="pushToWebsite"
          value="1"
          ${checked ? 'checked' : ''}
        >
        <span class="dash-check__box" aria-hidden="true"></span>
        <span class="dash-check__label">Push to Website</span>
      </label>
      <p class="dash-field__hint">When unchecked, the product is added to inventory and POS only — it will not appear on the online store.</p>
    </div>`;
}

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
    ? products.filter((p) => p.collectionName === filterCollection || p.category === filterCollection)
    : products;

  if (!filtered.length) {
    return '<p class="dash-empty">No products yet. Click <strong>+ ADD ITEM</strong> to create one.</p>';
  }

  return `
    <div class="dash-table-wrap">
      <table class="dash-table" data-catalog-table>
        <thead>
          <tr>
            <th scope="col">Item name</th>
            <th scope="col">Category</th>
            <th scope="col">Price</th>
            <th scope="col">Cost</th>
            <th scope="col">Margin</th>
            <th scope="col">In stock</th>
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
  const thumb = product.imageUrls?.[0]
    ? `<img src="${escapeAttr(product.imageUrls[0])}" alt="" class="dash-table__thumb" loading="lazy">`
    : `<span class="dash-table__thumb dash-table__thumb--placeholder" aria-hidden="true">${escapeHtml((product.title || '?').charAt(0))}</span>`;

  const retail = Number(product.retailPrice) || 0;
  const cost = Number(product.costPrice) || 0;
  const margin = retail > 0 ? ((retail - cost) / retail) * 100 : 0;
  const categoryLabel = product.category || product.collectionName || '—';

  return `
    <tr data-id="${escapeAttr(product.id)}" data-product-row="${escapeAttr(product.id)}" class="dash-row-clickable" data-edit-catalog="${escapeAttr(product.id)}">
      <td>
        <div class="dash-table__product">
          ${thumb}
          <div>
            <span class="dash-table__title">${escapeHtml(product.title)}</span>
            ${product.description ? `<span class="dash-table__sub">${escapeHtml(String(product.description).slice(0, 80))}</span>` : ''}
          </div>
        </div>
      </td>
      <td><span class="dash-chip dash-chip--muted">${escapeHtml(categoryLabel)}</span></td>
      <td class="dash-table__num">${formatNum(retail)} LD</td>
      <td class="dash-table__num">${formatNum(cost)} LD</td>
      <td class="dash-table__num">${margin.toFixed(2).replace('.', ',')}%</td>
      <td class="dash-table__num">${stockStatusCellHtml(product.stockQuantity, product.minStockAlert)}</td>
      <td data-stop-row-edit>
        <div class="dash-table__actions">
          <button type="button" class="dash-btn dash-btn--ghost dash-btn--sm" data-edit-catalog="${escapeAttr(product.id)}">Edit</button>
          <button type="button" class="dash-btn dash-btn--danger dash-btn--sm" data-id="${escapeAttr(product.id)}" data-delete-catalog="${escapeAttr(product.id)}">Delete</button>
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
          <label for="cat-title"><span class="dash-field__label-en">Item name</span> <span class="dash-field__label-ar" lang="ar">اسم المنتج</span></label>
          <input id="cat-title" name="title" type="text" class="dash-input--bidi" required value="${escapeAttr(product?.title ?? '')}" placeholder="Oud Noir Candle">
        </div>
        <div class="dash-field dash-field--full">
          <label for="cat-description"><span class="dash-field__label-en">Description</span> <span class="dash-field__label-ar" lang="ar">الوصف</span></label>
          <textarea id="cat-description" name="description" class="dash-input--bidi" rows="3" placeholder="Optional product details for the website">${escapeHtml(product?.description ?? '')}</textarea>
        </div>
        <div class="dash-field">
          <label for="cat-collection"><span class="dash-field__label-en">Collection</span> <span class="dash-field__hint">(optional)</span></label>
          <select id="cat-collection" name="collection_id" data-collection-select>
            ${taxonomySelectOptionsHtml(liveCollections, selectedCollectionId, 'No collections yet', { optional: true })}
          </select>
        </div>
        <div class="dash-field">
          <label for="cat-category"><span class="dash-field__label-en">Category</span> <span class="dash-field__hint">(optional)</span></label>
          <select id="cat-category" name="category_id" data-category-select>
            ${taxonomySelectOptionsHtml(liveCategories, selectedCategoryId, 'No categories yet', { optional: true })}
          </select>
        </div>
        ${barcodeFieldHtml('cat-barcode', product?.barcode ?? '', 'Barcode / SKU')}
        <div class="dash-field">
          <label for="cat-retail"><span class="dash-field__label-en">Price</span> <span class="dash-field__label-ar" lang="ar">سعر البيع</span></label>
          <input id="cat-retail" name="retailPrice" type="number" min="0" step="0.01" required value="${product?.retailPrice ?? ''}" placeholder="48.00">
        </div>
        <div class="dash-field">
          <label for="cat-cost"><span class="dash-field__label-en">Cost</span> <span class="dash-field__label-ar" lang="ar">سعر التكلفة</span></label>
          <input id="cat-cost" name="costPrice" type="number" min="0" step="0.01" required value="${product?.costPrice ?? ''}" placeholder="18.00">
        </div>
        <div class="dash-field">
          <label for="cat-stock">In stock</label>
          <input id="cat-stock" name="stockQuantity" type="number" min="0" step="1" required value="${product?.stockQuantity ?? ''}" placeholder="24">
        </div>
      </div>

      ${imageUploaderHtml(product?.imageUrls ?? [], 'cat-images')}

      ${pushToWebsiteFieldHtml(product, 'cat-push-website')}

      <div class="dash-form__actions">
        <button type="submit" class="dash-btn dash-btn--primary">${isEdit ? 'Save item' : 'Add item'}</button>
        <button type="button" class="dash-btn dash-btn--ghost" data-cancel-catalog-edit>Cancel</button>
        ${isEdit && product?.id
          ? `<button type="button" class="dash-btn dash-btn--danger" data-id="${escapeAttr(product.id)}" data-delete-catalog="${escapeAttr(product.id)}">Delete</button>`
          : ''}
      </div>
      <p class="dash-form__note">Collection and category are optional. Check “Push to Website” to show this item in the online store.</p>
    </form>
  `;
}

/**
 * Product <option> list for form dropdowns.
 * @param {Array<object>} products
 */
function productOptionsHtml(products = []) {
  return ['<option value="">Select product…</option>']
    .concat((products || [])
      .filter((p) => p?.id)
      .map((p) => {
        const label = escapeHtml(p.title || p.name || 'Untitled');
        const code = p.barcode ? ` · ${escapeHtml(p.barcode)}` : '';
        return `<option value="${escapeAttr(p.id)}">${label}${code}</option>`;
      }))
    .join('');
}

/**
 * The "Record Waste" form (product, quantity, reason).
 * @param {Array<object>} products
 */
export function wasteFormHtml(products = []) {
  const options = productOptionsHtml(products);
  return `
    <form class="dash-form" data-waste-form autocomplete="off">
      <div class="dash-field">
        <label for="waste-product">Product</label>
        <select id="waste-product" name="product_id" data-waste-product required>${options}</select>
      </div>
      <div class="dash-form__grid">
        <div class="dash-field">
          <label for="waste-qty">Quantity wasted</label>
          <input id="waste-qty" name="quantity" type="number" min="1" step="1" required placeholder="0" inputmode="numeric">
        </div>
        <div class="dash-field">
          <label for="waste-reason">Reason</label>
          <input id="waste-reason" name="reason" type="text" list="waste-reasons" placeholder="Damaged / expired / broken">
          <datalist id="waste-reasons">
            <option value="Damaged"></option>
            <option value="Expired"></option>
            <option value="Broken"></option>
            <option value="Lost / stolen"></option>
            <option value="Quality reject"></option>
          </datalist>
        </div>
      </div>
      <div class="dash-form__actions">
        <button type="submit" class="dash-btn dash-btn--danger">Record waste &amp; deduct stock</button>
      </div>
      <p class="dash-form__note">Stock is removed FIFO from the oldest batches and the loss (at landed cost) is recorded in accounting.</p>
    </form>`;
}

/**
 * Recent waste records table.
 * @param {Array<object>} rows
 */
export function wasteTableHtml(rows = []) {
  if (!rows.length) {
    return '<p class="dash-empty">No waste recorded yet.</p>';
  }

  const money = (n) => new Intl.NumberFormat('en-LY', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0);
  const total = rows.reduce((acc, r) => acc + (Number(r.line_cost) || 0), 0);

  return `
    <div class="dash-waste-summary">
      <span>Total waste loss</span>
      <strong class="dash-summary__cost">${money(total)}</strong>
    </div>
    <div class="dash-table-wrap">
      <table class="dash-table">
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Product</th>
            <th scope="col">Reason</th>
            <th scope="col">Qty</th>
            <th scope="col">Unit cost</th>
            <th scope="col">Loss</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((r) => `
            <tr>
              <td class="dash-table__num">${escapeHtml(r.recorded_at ? String(r.recorded_at).slice(0, 10) : '—')}</td>
              <td><strong>${escapeHtml(r.product_name || '—')}</strong></td>
              <td>${escapeHtml(r.waste_reason || '—')}</td>
              <td class="dash-table__num">${escapeHtml(r.quantity)}</td>
              <td class="dash-table__num">${money(r.unit_cost)}</td>
              <td class="dash-table__num dash-summary__cost">${money(r.line_cost)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>`;
}

/**
 * @param {Array<{ id: string, name: string }>} items
 * @param {string} selectedId
 * @param {string} emptyLabel
 */
function taxonomySelectOptionsHtml(items, selectedId = '', emptyLabel = 'None available', { optional = false } = {}) {
  if (!items.length) {
    return `<option value="">${escapeHtml(optional ? 'None (optional)' : emptyLabel)}</option>`;
  }

  const hasSelected = items.some((item) => String(item.id) === String(selectedId));
  return `
    <option value="" ${hasSelected ? '' : 'selected'}>${optional ? 'None (optional)' : 'Select…'}</option>
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
            <th scope="col"><span class="dash-field__label-en">Cost</span> <span class="dash-field__label-ar" lang="ar">سعر التكلفة</span></th>
            <th scope="col"><span class="dash-field__label-en">Retail</span> <span class="dash-field__label-ar" lang="ar">سعر البيع</span></th>
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
      <td class="dash-table__num" data-field="stock">${stockStatusCellHtml(product.stockQuantity, product.minStockAlert)}</td>
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

function orderStatusBadge(status) {
  const s = String(status || 'pending').toLowerCase();
  const map = {
    pending: ['dash-status--pending', 'Pending'],
    paid: ['dash-status--live', 'Paid'],
    completed: ['dash-status--live', 'Completed'],
    cancelled: ['dash-status--off', 'Cancelled'],
    parked: ['dash-status--pending', 'Parked'],
  };
  const [cls, label] = map[s] || ['dash-status--pending', String(status || '—')];
  return `<span class="dash-status ${cls}">${escapeHtml(label)}</span>`;
}

/**
 * Website orders table (online storefront).
 * @param {Array<object>} rows
 */
export function websiteOrdersTableHtml(rows = []) {
  if (!rows.length) {
    return '<p class="dash-empty">No website orders yet. Orders appear here when customers checkout on the online store.</p>';
  }

  return `
    <div class="dash-table-wrap">
      <table class="dash-table">
        <thead>
          <tr>
            <th scope="col">Invoice</th>
            <th scope="col">Date</th>
            <th scope="col">Customer</th>
            <th scope="col">Payment</th>
            <th scope="col">Status</th>
            <th scope="col">Total</th>
            <th scope="col"></th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((r) => `
            <tr class="dash-row-clickable" data-view-web-order="${escapeAttr(r.id)}" title="View order details">
              <td><code class="dash-barcode">${escapeHtml(r.invoice_number || '—')}</code></td>
              <td class="dash-table__num">${escapeHtml(r.created_at ? String(r.created_at).slice(0, 16).replace('T', ' ') : '—')}</td>
              <td>
                <strong>${escapeHtml(r.customer_name || '—')}</strong>
                ${r.customer_phone ? `<div class="dash-table__sub">${escapeHtml(r.customer_phone)}</div>` : ''}
              </td>
              <td>${escapeHtml(String(r.payment_method || '—').toUpperCase())}</td>
              <td>${orderStatusBadge(r.status)}</td>
              <td class="dash-table__num">${formatLyd(Number(r.total_amount || 0))}</td>
              <td>
                <button type="button" class="dash-btn dash-btn--ghost dash-btn--sm" data-print-web-order="${escapeAttr(r.id)}">Print</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>`;
}

/**
 * Detail modal for a website order.
 * @param {object} order
 * @param {object[]} items
 */
export function websiteOrderDetailHtml(order, items = []) {
  const rowsHtml = items.length
    ? items.map((it) => `
        <tr>
          <td><strong>${escapeHtml(it.product_name || '—')}</strong></td>
          <td class="dash-table__num">${formatLyd(Number(it.unit_price || 0))}</td>
          <td class="dash-table__num">${escapeHtml(it.quantity)}</td>
          <td class="dash-table__num">${formatLyd(Number(it.unit_price || 0) * Number(it.quantity || 0))}</td>
        </tr>`).join('')
    : '<tr><td colspan="4" class="dash-empty">No line items.</td></tr>';

  const canComplete = ['pending', 'paid'].includes(String(order?.status || ''));
  const canCancel = ['pending', 'paid', 'completed'].includes(String(order?.status || ''));

  return `
    <div class="dash-modal__backdrop" data-close-order-modal></div>
    <div class="dash-modal__dialog" role="dialog" aria-modal="true" aria-label="Website order details">
      <header class="dash-modal__header">
        <div>
          <h2 class="dash-modal__title">${escapeHtml(order?.invoice_number || 'Order')}</h2>
          <p class="dash-modal__sub">${escapeHtml(order?.customer_name || '')} · ${orderStatusBadge(order?.status)}</p>
        </div>
        <button type="button" class="dash-btn dash-btn--ghost dash-btn--sm" data-close-order-modal aria-label="Close">✕</button>
      </header>

      <div class="dash-modal__summary">
        <div><span>Payment</span><strong>${escapeHtml(String(order?.payment_method || '—').toUpperCase())}</strong></div>
        <div><span>Subtotal</span><strong>${formatLyd(Number(order?.subtotal_amount || order?.total_amount || 0))}</strong></div>
        <div><span>Shipping</span><strong>${formatLyd(Number(order?.shipping_amount || 0))}</strong></div>
        <div><span>Total</span><strong>${formatLyd(Number(order?.total_amount || 0))}</strong></div>
      </div>

      <div class="dash-order-contact">
        <p><span>Phone</span> ${escapeHtml(order?.customer_phone || '—')}</p>
        <p><span>Email</span> ${escapeHtml(order?.customer_email || '—')}</p>
        <p><span>Address</span> ${escapeHtml([order?.customer_address, order?.customer_city].filter(Boolean).join(', ') || '—')}</p>
      </div>

      <div class="dash-table-wrap">
        <table class="dash-table">
          <thead>
            <tr>
              <th scope="col">Product</th>
              <th scope="col">Unit</th>
              <th scope="col">Qty</th>
              <th scope="col">Line</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>

      <div class="dash-modal__actions">
        <button type="button" class="dash-btn dash-btn--primary dash-btn--sm" data-print-web-order="${escapeAttr(order.id)}">Print order</button>
        ${canComplete ? `<button type="button" class="dash-btn dash-btn--ghost dash-btn--sm" data-complete-web-order="${escapeAttr(order.id)}">Mark completed</button>` : ''}
        ${canCancel ? `<button type="button" class="dash-btn dash-btn--danger dash-btn--sm" data-cancel-web-order="${escapeAttr(order.id)}">Cancel order</button>` : ''}
        <button type="button" class="dash-btn dash-btn--ghost dash-btn--sm" data-close-order-modal>Close</button>
      </div>
    </div>`;
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
        const total = Number(t.total_amount || 0);
        const down = Number(t.downpayment || 0);
        const balance = Math.max(0, total - down);
        const title = t.customer_name || t.ticket_label || `Ticket ${String(t.id).slice(0, 8)}`;
        return `
          <li class="dash-open-tickets__item" data-open-ticket-id="${escapeAttr(t.id)}">
            <div>
              <p class="dash-open-tickets__title">${escapeHtml(title)}${t.invoice_number ? ` <code class="dash-barcode">${escapeHtml(t.invoice_number)}</code>` : ''}</p>
              <p class="dash-open-tickets__meta">
                ${t.customer_phone ? `${escapeHtml(t.customer_phone)} · ` : ''}
                ${t.customer_location ? `${escapeHtml(t.customer_location)} · ` : ''}
                ${qty} item${qty === 1 ? '' : 's'}
                · Total ${formatLyd(total)}
                · Paid ${formatLyd(down)}
                · Due ${formatLyd(balance)}
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
          <label for="product-title"><span class="dash-field__label-en">Product Title</span> <span class="dash-field__label-ar" lang="ar">اسم المنتج</span></label>
          <input id="product-title" name="title" type="text" class="dash-input--bidi" required value="${escapeAttr(product?.title ?? '')}" placeholder="Oud Noir Candle">
        </div>
        <div class="dash-field">
          <label for="product-collection"><span class="dash-field__label-en">Collection</span></label>
          <select id="product-collection" name="collection_id" data-collection-select required ${liveCollections.length ? '' : 'disabled'}>
            ${taxonomySelectOptionsHtml(liveCollections, selectedCollectionId, 'Please create a Collection first')}
          </select>
        </div>
        <div class="dash-field">
          <label for="product-category"><span class="dash-field__label-en">Category</span></label>
          <select id="product-category" name="category_id" data-category-select required ${liveCategories.length ? '' : 'disabled'}>
            ${taxonomySelectOptionsHtml(liveCategories, selectedCategoryId, 'Please create a Category first')}
          </select>
        </div>
        <div class="dash-field">
          <label for="product-cost"><span class="dash-field__label-en">Cost Price</span> <span class="dash-field__label-ar" lang="ar">سعر التكلفة</span></label>
          <input id="product-cost" name="costPrice" type="number" min="0" step="0.01" required value="${product?.costPrice ?? ''}" placeholder="18.00">
        </div>
        <div class="dash-field">
          <label for="product-retail"><span class="dash-field__label-en">Retail Price</span> <span class="dash-field__label-ar" lang="ar">سعر البيع</span></label>
          <input id="product-retail" name="retailPrice" type="number" min="0" step="0.01" required value="${product?.retailPrice ?? ''}" placeholder="48.00">
        </div>
        <div class="dash-field">
          <label for="product-stock">Stock Quantity</label>
          <input id="product-stock" name="stockQuantity" type="number" min="0" step="1" required value="${product?.stockQuantity ?? ''}" placeholder="24">
        </div>
        ${barcodeFieldHtml('product-barcode', product?.barcode ?? '', 'Barcode String')}
      </div>

      ${imageUploaderHtml(product?.imageUrls ?? [], 'product-images')}

      ${pushToWebsiteFieldHtml(product, 'product-push-website')}

      <div class="dash-form__actions">
        <button type="submit" class="dash-btn dash-btn--primary" ${liveCollections.length && liveCategories.length ? '' : 'disabled'}>${isEdit ? 'Save to Inventory' : 'Add to Inventory'}</button>
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
        <nav class="dash-nav" aria-label="Admin sections">
          <div class="dash-nav__group is-open" data-nav-group="reports">
            <button type="button" class="dash-nav__link dash-nav__parent" data-nav="reports" data-nav-toggle="reports" aria-expanded="true">
              <span class="dash-nav__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" focusable="false"><path fill="currentColor" d="M3.5 18.49l6-6.01 4 4L22 6.92l-1.41-1.41-7.09 7.97-4-4L2 16.99z"/></svg>
              </span>
              <span class="dash-nav__label">Reports</span>
              <span class="dash-nav__chevron" aria-hidden="true">▾</span>
            </button>
            <div class="dash-nav__sub" data-nav-sub="reports">
              <button type="button" class="dash-nav__sublink" data-view="reports">Sales summary</button>
              <button type="button" class="dash-nav__sublink" data-view="sales-by-item">Sales by item</button>
            </div>
          </div>
          <button type="button" class="dash-nav__link is-active" data-nav="accounting" data-view="dashboard" aria-current="page">
            <span class="dash-nav__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false"><path fill="currentColor" d="M3 13h2v8H3v-8zm4-6h2v14H7V7zm4-4h2v18h-2V3zm4 8h2v10h-2V11zm4-5h2v15h-2V6z"/></svg>
            </span>
            <span class="dash-nav__label">Accounting</span>
          </button>
          <button type="button" class="dash-nav__link" data-nav="catalog" data-view="catalog">
            <span class="dash-nav__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false"><path fill="currentColor" d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zm10 0c-1.1 0-1.99.9-1.99 2S15.9 22 17 22s2-.9 2-2-.9-2-2-2zM7.16 14.26l.03-.12L8.1 12h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49A1 1 0 0 0 20.01 3H5.21l-.94-2H1v2h2l3.6 7.59-1.35 2.44C4.52 14.37 5.48 16 7 16h12v-2H7.42c-.14 0-.25-.11-.26-.25z"/></svg>
            </span>
            <span class="dash-nav__label">Products</span>
          </button>
          <button type="button" class="dash-nav__link" data-nav="orders" data-view="website-orders">
            <span class="dash-nav__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false"><path fill="currentColor" d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z"/></svg>
            </span>
            <span class="dash-nav__label">Website Orders</span>
          </button>
          <button type="button" class="dash-nav__link" data-nav="taxonomy" data-view="taxonomy">
            <span class="dash-nav__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false"><path fill="currentColor" d="M17.63 5.84C17.27 5.33 16.67 5 16 5L5 5.01C3.9 5.01 3 5.9 3 7v10c0 1.1.9 1.99 2 1.99L16 19c.67 0 1.27-.33 1.63-.84L22 12l-4.37-6.16z"/></svg>
            </span>
            <span class="dash-nav__label">Collections &amp; Categories</span>
          </button>
          <button type="button" class="dash-nav__link" data-nav="valuation" data-view="valuation">
            <span class="dash-nav__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false"><path fill="currentColor" d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>
            </span>
            <span class="dash-nav__label">Inventory Valuation</span>
          </button>
          <button type="button" class="dash-nav__link" data-nav="waste" data-view="waste">
            <span class="dash-nav__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false"><path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
            </span>
            <span class="dash-nav__label">Waste</span>
          </button>
          <button type="button" class="dash-nav__link" data-nav="credentials" data-view="credentials">
            <span class="dash-nav__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false"><path fill="currentColor" d="M12.65 10C11.83 7.67 9.61 6 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6c2.61 0 4.83-1.67 5.65-4H17v4h4v-4h2v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/></svg>
            </span>
            <span class="dash-nav__label">Passwords &amp; PINs</span>
          </button>
          <a href="/?app=storefront" class="dash-nav__link dash-nav__link--external" data-nav="website" target="_blank" rel="noopener">
            <span class="dash-nav__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>
            </span>
            <span class="dash-nav__label">View Website</span>
          </a>
          <a href="/?app=pos" class="dash-nav__link dash-nav__link--external" data-nav="pos">
            <span class="dash-nav__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false"><path fill="currentColor" d="M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z"/></svg>
            </span>
            <span class="dash-nav__label">Open POS</span>
          </a>
        </nav>
        <footer class="dash-sidebar__footer">
          <p class="dash-sidebar__role" data-admin-user hidden></p>
          <button type="button" class="dash-btn dash-btn--ghost dash-btn--sm dash-btn--full dash-sidebar__logout" data-logout>Sign out</button>
        </footer>
      </aside>

      <div class="dash-drawer-backdrop" data-drawer-backdrop hidden></div>

      <div class="dash-main">
        <header class="dash-topbar">
          <div class="dash-topbar__lead">
            <button type="button" class="dash-menu-btn" data-drawer-toggle aria-label="Open menu" aria-expanded="false">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M4 6h16M4 12h16M4 18h16"/>
              </svg>
            </button>
            <div>
              <h1 class="dash-topbar__title" data-page-title>Accounting Dashboard</h1>
              <p class="dash-topbar__subtitle" data-last-updated>Last updated —</p>
            </div>
          </div>
          <div class="dash-topbar__actions">
            <button type="button" class="dash-btn dash-btn--primary dash-btn--sm dash-topbar__backup" data-backup-pdf>⬇ Daily Backup (PDF)</button>
            <button type="button" class="dash-btn dash-btn--ghost dash-btn--sm" data-refresh>Refresh</button>
          </div>
        </header>

        <div class="dash-views">
          <section class="dash-view" data-panel="reports" aria-label="Sales summary reports" hidden>
            <div data-reports-host>
              <p class="dash-empty">Loading sales summary…</p>
            </div>
          </section>

          <section class="dash-view" data-panel="sales-by-item" aria-label="Sales by item report" hidden>
            <div data-sales-by-item-host>
              <p class="dash-empty">Loading sales by item…</p>
            </div>
          </section>

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
              <article class="dash-panel">
                <header class="dash-panel__header dash-panel__header--row">
                  <h2>POS Payments</h2>
                  <button type="button" class="dash-btn dash-btn--ghost dash-btn--sm" data-refresh-payments>Refresh</button>
                </header>
                <div class="dash-panel__body" data-payments-host>
                  <p class="dash-empty">Loading payment totals…</p>
                </div>
              </article>
            </div>
          </section>

          <section class="dash-view" data-panel="catalog" aria-label="Products" hidden>
            <article class="dash-panel dash-panel--items">
              <header class="dash-panel__header dash-panel__header--row items-toolbar">
                <div class="items-toolbar__actions">
                  <button type="button" class="dash-btn dash-btn--primary" data-add-catalog-item>+ ADD ITEM</button>
                  <button type="button" class="rpt-export" data-export-catalog>EXPORT</button>
                </div>
                <div class="dash-panel__header-actions">
                  <select class="dash-select" data-catalog-filter aria-label="Filter by collection">
                    <option value="All">All items</option>
                  </select>
                  <span class="dash-panel__count" data-catalog-count>0 items</span>
                </div>
              </header>
              <div class="dash-panel__body" data-catalog-host></div>
            </article>

            <article class="dash-panel dash-panel--form dash-panel--item-form" data-catalog-form-panel hidden>
              <header class="dash-panel__header dash-panel__header--row">
                <h2 data-catalog-form-title>Add item</h2>
                <button type="button" class="dash-btn dash-btn--ghost dash-btn--sm" data-cancel-catalog-edit aria-label="Close">✕</button>
              </header>
              <div class="dash-panel__body" data-catalog-form-host></div>
            </article>
          </section>

          <section class="dash-view" data-panel="website-orders" aria-label="Website orders" hidden>
            <div class="dash-catalog-intro">
              <p>Orders placed on the online storefront. Each order gets a <strong>WEB-</strong> invoice number automatically.</p>
            </div>
            <article class="dash-panel">
              <header class="dash-panel__header dash-panel__header--row">
                <div>
                  <h2>Website Orders</h2>
                  <p class="dash-panel__sub">Cash on delivery and UPAY card payments</p>
                </div>
                <div class="dash-panel__header-actions">
                  <button type="button" class="dash-btn dash-btn--ghost dash-btn--sm" data-enable-order-push title="Get a phone alert when a customer orders online">Enable order alerts</button>
                  <button type="button" class="dash-btn dash-btn--ghost dash-btn--sm" data-test-order-push hidden>Test alert</button>
                  <button type="button" class="dash-btn dash-btn--ghost dash-btn--sm" data-refresh-website-orders>Refresh</button>
                </div>
              </header>
              <div class="dash-panel__body" data-website-orders-host>
                <p class="dash-empty">Loading website orders…</p>
              </div>
            </article>
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

          <section class="dash-view" data-panel="valuation" aria-label="Inventory valuation" hidden>
            <div data-valuation-host>
              <p class="dash-empty">Loading inventory valuation…</p>
            </div>
          </section>

          <section class="dash-view" data-panel="waste" aria-label="Inventory waste" hidden>
            <div class="dash-catalog-intro">
              <p>Record damaged, expired, or lost stock. The quantity is removed from inventory (FIFO from the oldest batches) and the loss is booked to accounting at landed cost.</p>
            </div>
            <div class="dash-inventory-layout">
              <article class="dash-panel dash-panel--grow">
                <header class="dash-panel__header dash-panel__header--row">
                  <h2>Recent Waste</h2>
                  <button type="button" class="dash-btn dash-btn--ghost dash-btn--sm" data-refresh-waste>Refresh</button>
                </header>
                <div class="dash-panel__body" data-waste-host>
                  <p class="dash-empty">Loading…</p>
                </div>
              </article>
              <article class="dash-panel dash-panel--form">
                <header class="dash-panel__header">
                  <h2>Record Waste</h2>
                </header>
                <div class="dash-panel__body" data-waste-form-host></div>
              </article>
            </div>
          </section>

          <section class="dash-view" data-panel="credentials" aria-label="Passwords and PINs" hidden>
            <div class="dash-catalog-intro">
              <p>Reset credentials for the <strong>Admin / Dashboard</strong> login, the <strong>POS</strong> unlock PIN, and the <strong>Admin PIN</strong> used to confirm invoice refunds. Changes are saved to the users table in Supabase.</p>
            </div>
            <div class="dash-panels-row dash-credentials">
              <article class="dash-panel">
                <header class="dash-panel__header">
                  <h2>Admin / Dashboard password</h2>
                </header>
                <div class="dash-panel__body">
                  <form class="dash-form" data-cred-admin-password autocomplete="off">
                    <input type="hidden" name="username" data-cred-admin-username value="">
                    <div class="dash-field dash-field--full">
                      <label for="cred-admin-current">Current password</label>
                      <input id="cred-admin-current" name="currentPassword" type="password" required autocomplete="current-password">
                    </div>
                    <div class="dash-field">
                      <label for="cred-admin-new">New password</label>
                      <input id="cred-admin-new" name="newPassword" type="password" required minlength="6" autocomplete="new-password">
                    </div>
                    <div class="dash-field">
                      <label for="cred-admin-confirm">Confirm new password</label>
                      <input id="cred-admin-confirm" name="confirmPassword" type="password" required minlength="6" autocomplete="new-password">
                    </div>
                    <p class="dash-field__hint">Used to sign in to Admin / Accounting dashboard.</p>
                    <button type="submit" class="dash-btn dash-btn--primary">Update password</button>
                    <p class="dash-form__status" data-cred-admin-password-status hidden></p>
                  </form>
                </div>
              </article>

              <article class="dash-panel">
                <header class="dash-panel__header">
                  <h2>POS unlock PIN</h2>
                </header>
                <div class="dash-panel__body">
                  <form class="dash-form" data-cred-pos-pin autocomplete="off">
                    <div class="dash-field dash-field--full">
                      <label for="cred-pos-admin-pass">Admin password (confirm)</label>
                      <input id="cred-pos-admin-pass" name="adminPassword" type="password" required autocomplete="current-password">
                    </div>
                    <div class="dash-field">
                      <label for="cred-pos-new">New POS PIN (4–8 digits)</label>
                      <input id="cred-pos-new" name="newPin" type="password" inputmode="numeric" pattern="[0-9]{4,8}" required minlength="4" maxlength="8" autocomplete="off">
                    </div>
                    <div class="dash-field">
                      <label for="cred-pos-confirm">Confirm POS PIN</label>
                      <input id="cred-pos-confirm" name="confirmPin" type="password" inputmode="numeric" pattern="[0-9]{4,8}" required minlength="4" maxlength="8" autocomplete="off">
                    </div>
                    <p class="dash-field__hint">Used by staff to unlock the POS register.</p>
                    <button type="submit" class="dash-btn dash-btn--primary">Update POS PIN</button>
                    <p class="dash-form__status" data-cred-pos-pin-status hidden></p>
                  </form>
                </div>
              </article>

              <article class="dash-panel">
                <header class="dash-panel__header">
                  <h2>Admin confirmation PIN</h2>
                </header>
                <div class="dash-panel__body">
                  <form class="dash-form" data-cred-admin-pin autocomplete="off">
                    <div class="dash-field dash-field--full">
                      <label for="cred-admin-pin-pass">Admin password (confirm)</label>
                      <input id="cred-admin-pin-pass" name="adminPassword" type="password" required autocomplete="current-password">
                    </div>
                    <div class="dash-field">
                      <label for="cred-admin-pin-new">New admin PIN (4–8 digits)</label>
                      <input id="cred-admin-pin-new" name="newPin" type="password" inputmode="numeric" pattern="[0-9]{4,8}" required minlength="4" maxlength="8" autocomplete="off">
                    </div>
                    <div class="dash-field">
                      <label for="cred-admin-pin-confirm">Confirm admin PIN</label>
                      <input id="cred-admin-pin-confirm" name="confirmPin" type="password" inputmode="numeric" pattern="[0-9]{4,8}" required minlength="4" maxlength="8" autocomplete="off">
                    </div>
                    <p class="dash-field__hint">Used on POS when opening Invoices / refunds.</p>
                    <button type="submit" class="dash-btn dash-btn--primary">Update admin PIN</button>
                    <p class="dash-form__status" data-cred-admin-pin-status hidden></p>
                  </form>
                </div>
              </article>
            </div>
          </section>
        </div>
      </div>
      <div class="dash-modal" data-order-modal hidden></div>
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
