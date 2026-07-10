/**
 * In-store POS — product grid + live ticket + hardware barcode wedge.
 * Checkout persists via createOrder → orders / order_items / inventory_transactions.
 */
import {
  getProducts,
  getProductByBarcode,
  createOrder,
} from '../shared/supabase.js';

const els = {
  status: document.querySelector('[data-status]'),
  grid: document.querySelector('[data-grid]'),
  ticket: document.querySelector('[data-ticket]'),
  subtotal: document.querySelector('[data-subtotal]'),
  total: document.querySelector('[data-total]'),
  count: document.querySelector('[data-count]'),
  charge: document.querySelector('[data-charge]'),
  clear: document.querySelector('[data-clear]'),
  search: document.querySelector('[data-search]'),
};

/** @type {object[]} */
let catalog = [];

/**
 * Active ticket lines.
 * @type {Array<{ product_id: string, name: string, barcode: string, unit_price: number, wholesale_cost: number, quantity: number, stock_quantity: number }>}
 */
let ticket = [];

let searchQuery = '';
let busy = false;
let scanBusy = false;
let barcodeBuffer = '';
let lastKeyTime = Date.now();

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

function ticketTotals() {
  const units = ticket.reduce((sum, line) => sum + line.quantity, 0);
  const subtotal = ticket.reduce(
    (sum, line) => sum + line.unit_price * line.quantity,
    0,
  );
  return { units, subtotal };
}

function renderTicket() {
  const { units, subtotal } = ticketTotals();

  if (els.count) {
    els.count.textContent = units
      ? `${units} item${units === 1 ? '' : 's'}`
      : 'Empty';
  }
  if (els.subtotal) els.subtotal.textContent = money(subtotal);
  if (els.total) els.total.textContent = money(subtotal);
  if (els.charge) els.charge.disabled = busy || ticket.length === 0;

  if (!els.ticket) return;

  if (!ticket.length) {
    els.ticket.innerHTML = `
      <div class="empty-ticket">
        <p>No items yet</p>
        <span>Tap a product or scan a barcode</span>
      </div>
    `;
    return;
  }

  els.ticket.innerHTML = ticket.map((line) => `
    <div class="line" data-line-id="${escapeAttr(line.product_id)}">
      <div>
        <p class="line__name">${escapeHtml(line.name)}</p>
        <p class="line__meta">${money(line.unit_price)} × ${line.quantity}</p>
      </div>
      <div class="line__controls">
        <button type="button" data-qty="-1" aria-label="Decrease">−</button>
        <span>${line.quantity}</span>
        <button type="button" data-qty="1" aria-label="Increase">+</button>
      </div>
      <strong>${money(line.unit_price * line.quantity)}</strong>
    </div>
  `).join('');
}

function renderGrid() {
  if (!els.grid) return;

  const filtered = catalog.filter((p) => {
    if (p.is_active === false) return false;
    if (!searchQuery) return true;
    const hay = `${p.name || ''} ${p.barcode || ''} ${p.description || ''}`.toLowerCase();
    return hay.includes(searchQuery);
  });

  if (!filtered.length) {
    els.grid.innerHTML = '<p class="empty">No products match your search.</p>';
    return;
  }

  els.grid.innerHTML = filtered.map((p) => {
    const stock = Number(p.stock_quantity ?? 0);
    const alertAt = Number(p.min_stock_alert ?? 5);
    const disabled = stock <= 0 ? 'disabled' : '';
    const stockLabel = stock <= 0
      ? 'Out'
      : stock <= alertAt
        ? `Low · ${stock}`
        : `${stock} left`;

    return `
      <button type="button" class="product ${stock <= 0 ? 'is-out' : ''}" data-add="${escapeAttr(p.id)}" ${disabled}>
        <span class="product__name">${escapeHtml(p.name || 'Untitled')}</span>
        <span class="product__price">${money(p.retail_price)}</span>
        <span class="product__stock">${stockLabel}</span>
      </button>
    `;
  }).join('');
}

/**
 * Append product to ticket or increment quantity.
 * @param {object} product
 */
function handleAddToCart(product) {
  if (!product?.id) return;

  const stock = Number(product.stock_quantity ?? 0);
  const existing = ticket.find((line) => line.product_id === product.id);
  const nextQty = (existing?.quantity || 0) + 1;

  if (stock <= 0) {
    setStatus(`${product.name || 'Item'} is out of stock`, 'error');
    return;
  }

  if (nextQty > stock) {
    setStatus(`Only ${stock} in stock for ${product.name || 'item'}`, 'error');
    return;
  }

  if (existing) {
    existing.quantity = nextQty;
    existing.stock_quantity = stock;
  } else {
    ticket.push({
      product_id: product.id,
      name: product.name || 'Item',
      barcode: product.barcode || '',
      unit_price: Number(product.retail_price ?? 0),
      wholesale_cost: Number(product.wholesale_cost ?? 0),
      quantity: 1,
      stock_quantity: stock,
    });
  }

  // Keep catalog row fresh
  const idx = catalog.findIndex((p) => p.id === product.id);
  if (idx >= 0) catalog[idx] = { ...catalog[idx], ...product };
  else catalog.push(product);

  renderTicket();
  renderGrid();
  setStatus(`✓ ${product.name || 'Item'}`, 'ok');
}

function adjustQty(productId, delta) {
  const line = ticket.find((l) => l.product_id === productId);
  if (!line) return;

  const next = line.quantity + delta;
  if (next <= 0) {
    ticket = ticket.filter((l) => l.product_id !== productId);
  } else if (next > line.stock_quantity) {
    setStatus(`Only ${line.stock_quantity} in stock`, 'error');
    return;
  } else {
    line.quantity = next;
  }

  renderTicket();
}

async function loadCatalog() {
  setStatus('Loading catalog…');
  try {
    catalog = await getProducts();
    renderGrid();
    renderTicket();
    setStatus(`${catalog.filter((p) => p.is_active !== false).length} products ready · scanner armed`, 'ok');
  } catch (err) {
    catalog = [];
    renderGrid();
    setStatus(err.message || 'Failed to load catalog', 'error');
  }
}

async function charge() {
  if (busy || !ticket.length) return;

  busy = true;
  renderTicket();
  setStatus('Processing sale…');

  const { subtotal } = ticketTotals();
  const orderData = {
    source: 'pos',
    status: 'completed',
    total_amount: subtotal,
  };
  const itemsArray = ticket.map((line) => ({
    product_id: line.product_id,
    quantity: line.quantity,
    unit_price: line.unit_price,
    wholesale_cost: line.wholesale_cost,
  }));

  try {
    const result = await createOrder(orderData, itemsArray);
    ticket = [];
    renderTicket();
    setStatus(`Sale complete · ${money(result.order.total_amount)}`, 'ok');
    await loadCatalog();
  } catch (err) {
    setStatus(err.message || 'Checkout failed', 'error');
  } finally {
    busy = false;
    renderTicket();
  }
}

// ── Hardware barcode wedge ─────────────────────────────────────────
window.addEventListener('keydown', async (e) => {
  if (e.target === els.search) return;

  const currentTime = Date.now();
  if (currentTime - lastKeyTime > 50) {
    barcodeBuffer = '';
  }
  lastKeyTime = currentTime;

  if (e.key === 'Enter') {
    if (barcodeBuffer.length > 3) {
      e.preventDefault();
      const code = barcodeBuffer;
      barcodeBuffer = '';

      if (scanBusy) return;
      scanBusy = true;
      setStatus(`Scanning ${code}…`);

      try {
        const product = await getProductByBarcode(code);
        if (product) {
          handleAddToCart(product);
        } else {
          setStatus(`Product with barcode "${code}" not found!`, 'error');
          alert(`Product with barcode "${code}" not found!`);
        }
      } finally {
        scanBusy = false;
      }
    }
    return;
  }

  if (e.key.length === 1 && /[a-zA-Z0-9]/.test(e.key)) {
    barcodeBuffer += e.key;
  }
});

// ── UI events ──────────────────────────────────────────────────────
els.grid?.addEventListener('click', (event) => {
  const btn = event.target.closest('[data-add]');
  if (!btn) return;
  const product = catalog.find((p) => String(p.id) === String(btn.dataset.add));
  if (product) handleAddToCart(product);
});

els.ticket?.addEventListener('click', (event) => {
  const line = event.target.closest('[data-line-id]');
  const qtyBtn = event.target.closest('[data-qty]');
  if (!line || !qtyBtn) return;
  adjustQty(line.dataset.lineId, Number(qtyBtn.dataset.qty));
});

els.clear?.addEventListener('click', () => {
  ticket = [];
  renderTicket();
  setStatus('Ticket cleared');
});

els.charge?.addEventListener('click', () => {
  charge();
});

els.search?.addEventListener('input', (event) => {
  searchQuery = String(event.target.value || '').trim().toLowerCase();
  renderGrid();
});

els.search?.addEventListener('keydown', async (event) => {
  if (event.key !== 'Enter') return;
  const value = String(event.target.value || '').trim();
  if (!value) return;
  event.preventDefault();

  const product = await getProductByBarcode(value);
  if (product) handleAddToCart(product);
  else {
    setStatus(`Product with barcode "${value}" not found!`, 'error');
    alert(`Product with barcode "${value}" not found!`);
  }

  event.target.value = '';
  searchQuery = '';
  renderGrid();
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
