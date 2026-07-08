/**
 * Admin dashboard HTML templates — semantic panel blocks.
 */

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
    <tr data-product-row="${escapeAttr(product.id)}">
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
          <button type="button" class="dash-btn dash-btn--danger dash-btn--sm" data-delete-product="${escapeAttr(product.id)}">Delete</button>
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
          </p>
        </li>
      `).join('')}
    </ol>
  `;
}

export function productFormHtml(product = null) {
  const isEdit = Boolean(product);

  return `
    <form class="dash-form" data-product-form autocomplete="off">
      <input type="hidden" name="id" value="${escapeAttr(product?.id ?? '')}">

      <div class="dash-form__grid">
        <div class="dash-field">
          <label for="product-title">Product Title</label>
          <input id="product-title" name="title" type="text" required value="${escapeAttr(product?.title ?? '')}" placeholder="Oud Noir Candle">
        </div>
        <div class="dash-field">
          <label for="product-collection">Collection Name</label>
          <input id="product-collection" name="collectionName" type="text" required value="${escapeAttr(product?.collectionName ?? '')}" placeholder="Candles">
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

      <div class="dash-field">
        <label for="product-images">Image URLs <span class="dash-field__hint">(Cloudflare R2 — one per line)</span></label>
        <textarea id="product-images" name="imageUrls" rows="3" placeholder="https://cdn.shamaadan.ly/products/example.jpg">${escapeHtml((product?.imageUrls ?? []).join('\n'))}</textarea>
      </div>

      <div class="dash-form__actions">
        <button type="submit" class="dash-btn dash-btn--primary">${isEdit ? 'Save Changes' : 'Add Product'}</button>
        ${isEdit ? '<button type="button" class="dash-btn dash-btn--ghost" data-cancel-edit>Cancel</button>' : ''}
      </div>
    </form>
  `;
}

export function authGateHtml() {
  return `
    <div class="dash-auth" data-auth-gate>
      <form class="dash-auth__card" data-auth-form>
        <div class="dash-auth__brand">
          <span class="dash-auth__logo" aria-hidden="true">◈</span>
          <h1>Shamaadan Admin</h1>
          <p>Central Dashboard &amp; Accounting Suite</p>
        </div>
        <div class="dash-field">
          <label for="admin-pin">Access PIN</label>
          <input id="admin-pin" name="pin" type="password" inputmode="numeric" autocomplete="current-password" required placeholder="Enter admin PIN">
        </div>
        <p class="dash-auth__error" data-auth-error hidden></p>
        <button type="submit" class="dash-btn dash-btn--primary dash-btn--full">Unlock Dashboard</button>
        <p class="dash-auth__hint">Default dev PIN: <code>shamaadan</code></p>
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
          <button type="button" class="dash-nav__link" data-view="inventory">
            <span aria-hidden="true">📦</span> Inventory
          </button>
          <a href="/?app=pos" class="dash-nav__link dash-nav__link--external">
            <span aria-hidden="true">🏬</span> Open POS
          </a>
        </nav>
        <footer class="dash-sidebar__footer">
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
                <header class="dash-panel__header">
                  <h2>Margin Summary</h2>
                </header>
                <div class="dash-panel__body" data-margin-host></div>
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
