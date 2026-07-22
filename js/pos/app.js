/**
 * POS register — high-end tablet interface with camera barcode scanning.
 * Staff unlock via numeric PIN (mapped to user id for sale attribution).
 */
import { getSupabase } from '../config/supabase.js';
import {
  createOrder,
  saveOpenTicket,
  getOpenTickets,
  cancelOpenTicket,
  completeOpenTicket,
  getPosSalesByDate,
  getOpenTicket,
  refundPosOrder,
  isSupabaseConfigured,
} from '../../shared/supabase.js';
import { getSharedDashboardState, toPosCatalogRow } from '../dashboard.js';
import { formatLyd } from '../shared/format.js';
import { BRAND, logoImg } from '../shared/brand.js';
import { fetchSession, loginPosPin, logout, verifyAdminPin } from '../shared/auth-client.js';
import { createCartState } from './cart-state.js';
import { createDashboard, renderDashboard } from './dashboard.js';
import { createBarcodeScanner } from './scanner.js';
import { printReceipt } from './receipt.js';
import { pinGateHtml, bindPinGate } from './pin-gate.js';
import { ticketsPageHtml, ticketsListHtml } from './tickets-page.js';
import {
  promptPaymentMethod,
  promptAdminPin,
  invoicesModalHtml,
  invoicesListHtml,
  invoiceDetailHtml,
  todayLocalDate,
} from './payment-invoice.js';

const CATEGORY_COLORS = {
  Candles: '#c9a84c',
  Diffusers: '#8a6238',
  Incense: '#a8842f',
  Sprays: '#b89a5a',
  Sets: '#d4b65e',
  Bakhoor: '#8f6b3a',
  Accessories: '#9a9286',
  Oils: '#c9a84c',
  General: '#c9a84c',
  'Gift Sets': '#d4b65e',
};

/**
 * @param {HTMLElement} root
 */
export async function mount(root) {
  root.className = 'pos';
  document.body.style.background = '#16130f';
  document.documentElement.style.colorScheme = 'dark';

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
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('is_active', true);
      if (!error && data?.length) {
        catalog = data.map((row) => toPosCatalogRow({
          id: row.id,
          barcode: row.barcode ?? row.sku,
          title: row.name,
          collectionName: row.category ?? 'General',
          category: row.category ?? 'General',
          retailPrice: Number(row.retail_price ?? row.price ?? 0),
          costPrice: Number(row.wholesale_cost ?? row.cost ?? 0),
          stockQuantity: Number(row.stock_quantity ?? row.stock ?? 0),
          imageUrls: row.image_urls ?? (row.image_url ? [row.image_url] : []),
        }));
      }
    } catch {
      // Use shared dashboard catalog
    }
  }

  const cart = createCartState(catalog);
  const dashboard = createDashboard(centralState);
  const categories = ['All', ...new Set(catalog.map((p) => p.category).filter(Boolean))];
  /** @type {string | null} */
  let activeOpenTicketId = null;

  root.innerHTML = buildShell(categories, staff);

  const els = {
    clock: root.querySelector('[data-clock]'),
    grid: root.querySelector('[data-product-grid]'),
    lines: root.querySelector('[data-line-items]'),
    itemCount: root.querySelector('[data-item-count]'),
    subtotal: root.querySelector('[data-subtotal]'),
    discountInput: root.querySelector('[data-discount-input]'),
    discountRow: root.querySelector('[data-discount-row]'),
    discountAmount: root.querySelector('[data-discount-amount]'),
    grand: root.querySelector('[data-grand-total]'),
    checkout: root.querySelector('[data-checkout]'),
    park: root.querySelector('[data-park-ticket]'),
    openTicketsBtn: root.querySelector('[data-open-tickets]'),
    openTicketsBadge: root.querySelector('[data-open-tickets-count]'),
    search: root.querySelector('[data-search]'),
    categories: root.querySelector('[data-categories]'),
    dashboard: root.querySelector('[data-dashboard]'),
    toast: root.querySelector('[data-pos-toast]'),
    staffLabel: root.querySelector('[data-staff-name]'),
    registerView: root.querySelector('[data-register-view]'),
    ticketsView: root.querySelector('[data-tickets-view]'),
  };

  let searchQuery = '';
  let activeCategory = 'All';
  /** @type {'register' | 'tickets'} */
  let activeView = 'register';

  /**
   * Highlight the active mobile bottom-tab.
   * @param {'products' | 'ticket' | 'tickets' | 'scan'} name
   */
  function setActiveMTab(name) {
    root.querySelectorAll('[data-mtab]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.mtab === name);
    });
  }

  async function fetchLiveCatalogRows() {
    if (!supabase) return [];
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('is_active', true);
      if (error || !data?.length) return [];
      return data.map((row) => toPosCatalogRow({
        id: row.id,
        barcode: row.barcode ?? row.sku,
        title: row.name,
        collectionName: row.category ?? 'General',
        category: row.category ?? 'General',
        retailPrice: Number(row.retail_price ?? row.price ?? 0),
        costPrice: Number(row.wholesale_cost ?? row.cost ?? 0),
        stockQuantity: Number(row.stock_quantity ?? row.stock ?? 0),
        imageUrls: row.image_urls ?? (row.image_url ? [row.image_url] : []),
      }));
    } catch {
      return [];
    }
  }

  async function syncCartStockFromServer() {
    const rows = await fetchLiveCatalogRows();
    if (rows.length) cart.syncCatalogStock(rows);
  }

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

  function ticketItemsPayload(items) {
    return items.map((line) => ({
      product_id: line.productId,
      quantity: line.quantity,
      unit_price: line.unitPrice,
      wholesale_cost: line.unitCost,
      product_name: line.name,
    }));
  }

  async function refreshOpenTicketBadge() {
    const badges = root.querySelectorAll('[data-open-tickets-count]');
    if (!badges.length || !isSupabaseConfigured()) return;
    try {
      const tickets = await getOpenTickets();
      const count = tickets.length;
      badges.forEach((badge) => {
        badge.hidden = count === 0;
        badge.textContent = String(count);
      });
    } catch {
      badges.forEach((badge) => { badge.hidden = true; });
    }
  }

  async function parkCurrentTicket() {
    const snapshot = cart.getSnapshot();
    if (!snapshot.items.length) {
      showToast(els.toast, 'Ticket is empty');
      return;
    }
    if (!isSupabaseConfigured()) {
      showToast(els.toast, 'Supabase not configured — cannot park ticket');
      return;
    }

    showParkTicketForm(snapshot.total);
  }

  async function showInvoiceModal() {
    if (!isSupabaseConfigured()) {
      showToast(els.toast, 'Supabase not configured');
      return;
    }

    const allowed = await promptAdminPin(root, verifyAdminPin);
    if (!allowed) return;

    root.querySelector('[data-invoice-modal]')?.remove();

    const to = todayLocalDate();
    const fromDate = new Date(`${to}T12:00:00`);
    fromDate.setDate(fromDate.getDate() - 30);
    const range = {
      from: `${fromDate.getFullYear()}-${String(fromDate.getMonth() + 1).padStart(2, '0')}-${String(fromDate.getDate()).padStart(2, '0')}`,
      to,
    };

    const modal = document.createElement('div');
    modal.className = 'pos-sale-modal';
    modal.dataset.invoiceModal = '';
    modal.innerHTML = invoicesModalHtml(range);
    root.appendChild(modal);

    await loadInvoiceList(modal);
  }

  /**
   * @param {HTMLElement} modal
   */
  async function loadInvoiceList(modal) {
    const list = modal.querySelector('[data-invoice-list]');
    if (!list) return;
    const from = modal.querySelector('[data-invoice-from]')?.value || '';
    const to = modal.querySelector('[data-invoice-to]')?.value || '';
    list.innerHTML = '<p class="pos-refund-modal__loading">Loading…</p>';
    try {
      const sales = await getPosSalesByDate({ from, to, limit: 150 });
      list.innerHTML = invoicesListHtml(sales);
      modal._invoiceCache = new Map(sales.map((s) => [String(s.id), s]));
    } catch (err) {
      console.error('[pos] invoice list failed:', err);
      list.innerHTML = `<p class="pos-refund-modal__empty">${escapeHtml(err?.message || 'Could not load invoices.')}</p>`;
    }
  }

  /**
   * @param {string} orderId
   */
  async function showInvoiceDetail(orderId) {
    const modal = root.querySelector('[data-invoice-modal]');
    if (!modal) return;
    const list = modal.querySelector('[data-invoice-list]');
    if (!list) return;

    let sale = modal._invoiceCache?.get(String(orderId));
    try {
      sale = await getOpenTicket(orderId);
      if (modal._invoiceCache) modal._invoiceCache.set(String(orderId), sale);
    } catch (err) {
      window.alert(err?.message || 'Could not open invoice.');
      return;
    }

    list.innerHTML = invoiceDetailHtml(sale);
  }

  /**
   * @param {number} ticketTotal
   */
  function showParkTicketForm(ticketTotal) {
    root.querySelector('[data-park-modal]')?.remove();

    const modal = document.createElement('div');
    modal.className = 'pos-sale-modal';
    modal.dataset.parkModal = '';
    modal.innerHTML = `
      <div class="pos-sale-modal__backdrop" data-park-backdrop></div>
      <div class="pos-sale-modal__card pos-park-form" role="dialog" aria-modal="true" aria-labelledby="pos-park-title">
        <p class="pos-sale-modal__badge">Park ticket</p>
        <h2 id="pos-park-title">Park ticket</h2>
        <p class="pos-park-form__total">Ticket total · ${formatLyd(ticketTotal)}</p>
        <p class="pos-park-form__hint">Customer details are optional — leave blank to park as Walk-in.</p>
        <form class="pos-park-form__fields" data-park-form>
          <label class="pos-park-form__field">
            <span>Customer name <em>(optional)</em></span>
            <input type="text" name="customer_name" data-park-name autocomplete="name" placeholder="Walk-in / Full name">
          </label>
          <label class="pos-park-form__field">
            <span>Phone number <em>(optional)</em></span>
            <input type="tel" name="customer_phone" data-park-phone autocomplete="tel" inputmode="tel" placeholder="09xxxxxxx">
          </label>
          <label class="pos-park-form__field">
            <span>Location <em>(optional)</em></span>
            <input type="text" name="customer_location" data-park-location autocomplete="street-address" placeholder="City / area / address">
          </label>
          <label class="pos-park-form__field">
            <span>Downpayment (LYD)</span>
            <input type="number" name="downpayment" data-park-downpayment min="0" step="0.01" max="${ticketTotal}" value="0" inputmode="decimal">
          </label>
          <p class="pos-park-form__balance" data-park-balance>Balance due · ${formatLyd(ticketTotal)}</p>
          <p class="pos-park-form__error" data-park-error hidden></p>
          <div class="pos-park-form__actions">
            <button type="button" class="pos-sale-modal__skip" data-park-cancel>Cancel</button>
            <button type="submit" class="pos-park-form__submit" data-park-submit>Park ticket</button>
          </div>
        </form>
      </div>
    `;
    root.appendChild(modal);

    const form = modal.querySelector('[data-park-form]');
    const downpaymentInput = modal.querySelector('[data-park-downpayment]');
    const balanceEl = modal.querySelector('[data-park-balance]');
    const errorEl = modal.querySelector('[data-park-error]');
    const nameInput = modal.querySelector('[data-park-name]');

    function updateBalance() {
      const paid = Math.max(0, Number(downpaymentInput?.value) || 0);
      const balance = Math.max(0, ticketTotal - paid);
      if (balanceEl) balanceEl.textContent = `Balance due · ${formatLyd(balance)}`;
    }

    downpaymentInput?.addEventListener('input', updateBalance);
    nameInput?.focus();

    form?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const customerName = String(modal.querySelector('[data-park-name]')?.value || '').trim() || 'Walk-in';
      const customerPhone = String(modal.querySelector('[data-park-phone]')?.value || '').trim();
      const customerLocation = String(modal.querySelector('[data-park-location]')?.value || '').trim();
      const downpayment = Math.max(0, Number(modal.querySelector('[data-park-downpayment]')?.value) || 0);

      if (downpayment > ticketTotal) {
        if (errorEl) {
          errorEl.hidden = false;
          errorEl.textContent = 'Downpayment cannot exceed ticket total.';
        }
        return;
      }

      const submitBtn = modal.querySelector('[data-park-submit]');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Parking…';
      }
      if (errorEl) {
        errorEl.hidden = true;
        errorEl.textContent = '';
      }

      try {
        els.park && (els.park.disabled = true);
        const snapshot = cart.getSnapshot();
        const parked = await saveOpenTicket({
          staff_user_id: staff.id,
          staff_name: staff.displayName || staff.username,
          ticket_label: customerName,
          customer_name: customerName,
          customer_phone: customerPhone || null,
          customer_location: customerLocation || null,
          downpayment,
          total_amount: snapshot.total,
          subtotal_amount: snapshot.subtotal,
          discount_amount: snapshot.discount,
          notes: snapshot.discount > 0 ? `Discount ${snapshot.discount.toFixed(2)} LYD` : null,
        }, ticketItemsPayload(snapshot.items));

        modal.remove();
        cart.clear({ restoreStock: false });
        activeOpenTicketId = null;
        await syncCartStockFromServer();
        const ticketNo = parked?.order?.invoice_number || '';
        showToast(els.toast, ticketNo
          ? `Parked ${ticketNo} · ${customerName}`
          : `Parked · ${customerName} · stock reserved`);
        await refreshOpenTicketBadge();
        await showTicketsPage();
      } catch (err) {
        console.error('[pos] park ticket failed:', err);
        if (errorEl) {
          errorEl.hidden = false;
          errorEl.textContent = err?.message || 'Failed to park ticket.';
        }
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Park ticket';
        }
      } finally {
        if (els.park) els.park.disabled = cart.getSnapshot().items.length === 0;
      }
    });
  }

  async function showTicketsPage() {
    if (!isSupabaseConfigured()) {
      showToast(els.toast, 'Supabase not configured');
      return;
    }

    let tickets = [];
    try {
      tickets = await getOpenTickets();
    } catch (err) {
      window.alert(err?.message || 'Could not load open tickets.');
      return;
    }

    activeView = 'tickets';
    if (els.registerView) els.registerView.hidden = true;
    if (els.ticketsView) {
      els.ticketsView.hidden = false;
      els.ticketsView.innerHTML = ticketsPageHtml(tickets);
    }
    root.classList.add('pos--tickets');
    setActiveMTab('tickets');
    await refreshOpenTicketBadge();
  }

  /**
   * @param {'products' | 'ticket'} [subview]
   */
  async function showRegisterView(subview) {
    activeView = 'register';
    if (els.ticketsView) {
      els.ticketsView.hidden = true;
      els.ticketsView.innerHTML = '';
    }
    if (els.registerView) els.registerView.hidden = false;
    root.classList.remove('pos--tickets');
    if (subview === 'ticket') {
      root.classList.add('pos--m-ticket');
      setActiveMTab('ticket');
    } else if (subview === 'products') {
      root.classList.remove('pos--m-ticket');
      setActiveMTab('products');
    } else {
      setActiveMTab(root.classList.contains('pos--m-ticket') ? 'ticket' : 'products');
    }
  }

  async function refreshTicketsList() {
    if (!els.ticketsView || activeView !== 'tickets') return;
    const list = els.ticketsView.querySelector('[data-tickets-list]');
    if (!list) return;
    try {
      const tickets = await getOpenTickets();
      list.innerHTML = ticketsListHtml(tickets);
      const subtitle = els.ticketsView.querySelector('.pos-tickets__subtitle');
      if (subtitle) subtitle.textContent = `${tickets.length} open · stock already reserved`;
      await refreshOpenTicketBadge();
    } catch (err) {
      window.alert(err?.message || 'Could not refresh tickets.');
    }
  }

  async function resumeTicket(orderId) {
    try {
      const tickets = await getOpenTickets();
      const ticket = tickets.find((t) => t.id === orderId);
      if (!ticket) throw new Error('Ticket not found.');

      // Void restores DB stock, then load onto register for editing / re-charge
      await cancelOpenTicket(orderId);
      await syncCartStockFromServer();

      const mapped = (ticket.order_items || []).map((line) => ({
        productId: line.product_id,
        name: line.product_name || 'Item',
        unitPrice: Number(line.unit_price),
        unitCost: Number(line.wholesale_cost || 0),
        quantity: Number(line.quantity),
      }));

      const result = cart.loadTicketLines(mapped);
      activeOpenTicketId = null;

      await showRegisterView();
      showToast(
        els.toast,
        result.missing?.length
          ? `Resumed (skipped: ${result.missing.join(', ')})`
          : 'Ticket resumed on register',
      );
      await refreshOpenTicketBadge();
    } catch (err) {
      console.error('[pos] resume ticket failed:', err);
      window.alert(err?.message || 'Failed to resume ticket.');
    }
  }

  async function chargeParkedTicket(orderId) {
    try {
      const ticket = (await getOpenTickets()).find((t) => t.id === orderId);
      if (!ticket) throw new Error('Ticket not found.');

      const total = Number(ticket.total_amount || 0);
      const down = Number(ticket.downpayment || 0);
      const balance = Math.max(0, total - down);
      const name = ticket.customer_name || ticket.ticket_label || 'customer';

      const payment = await promptPaymentMethod(root, balance);
      if (!payment) return;

      const result = await completeOpenTicket(orderId, payment);
      await syncCartStockFromServer();

      const lines = (ticket.order_items || []).map((line) => ({
        productId: line.product_id,
        title: line.product_name || 'Item',
        quantity: Number(line.quantity || 0),
        unitPrice: Number(line.unit_price || 0),
        unit_cost_at_sale: Number(line.wholesale_cost || 0),
      }));
      const units = lines.reduce((s, l) => s + l.quantity, 0);
      const cost = lines.reduce((s, l) => s + l.unit_cost_at_sale * l.quantity, 0);

      centralState.recordPosSale({
        revenue: total,
        cost,
        profit: total - cost,
        units,
        lines,
        staffUserId: staff.id,
        staffName: staff.displayName || staff.username,
        paymentMethod: payment.payment_method,
      });
      dashboard.refresh();

      showSaleComplete(root, {
        revenue: total,
        subtotal: total,
        discount: Number(ticket.discount_amount) || 0,
        cost,
        profit: total - cost,
        units,
        lines,
        receiptNo: ticket.invoice_number || `TKT-${String(ticket.id).slice(0, 8).toUpperCase()}`,
        register: 'Register #1',
        cashier: staff.displayName || staff.username,
        staffUserId: staff.id,
        paidAt: new Date(),
        paymentMethod: payment.payment_method,
        paymentReference: payment.payment_reference || null,
        paymentDate: payment.payment_date || null,
      }, els.toast);

      await refreshTicketsList();
      showToast(els.toast, `Charged ${name} · ${formatLyd(balance)} · ${payment.payment_method === 'cash' ? 'Cash' : 'Bank transfer'}`);
      return result;
    } catch (err) {
      console.error('[pos] charge parked ticket failed:', err);
      window.alert(err?.message || 'Failed to charge ticket.');
    }
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
    if (els.discountAmount) {
      els.discountAmount.textContent = `−${formatLyd(snapshot.discount)}`;
    }
    if (els.discountRow) {
      els.discountRow.hidden = !(snapshot.discount > 0);
    }
    if (els.discountInput && document.activeElement !== els.discountInput) {
      els.discountInput.value = snapshot.discount > 0 ? String(Number(snapshot.discount.toFixed(2))) : '0';
    }
    els.grand.textContent = formatLyd(snapshot.total);
    const empty = snapshot.items.length === 0;
    els.checkout.disabled = empty;
    if (els.park) els.park.disabled = empty || !isSupabaseConfigured();

    const cartBadge = root.querySelector('[data-mtab-cart-count]');
    if (cartBadge) {
      cartBadge.hidden = snapshot.itemCount === 0;
      cartBadge.textContent = String(snapshot.itemCount);
    }
  });

  els.discountInput?.addEventListener('input', () => {
    cart.setDiscount(Number(els.discountInput.value) || 0);
  });

  els.discountInput?.addEventListener('change', () => {
    cart.setDiscount(Number(els.discountInput.value) || 0);
    const clamped = cart.getSnapshot().discount;
    if (els.discountInput) {
      els.discountInput.value = clamped > 0 ? String(Number(clamped.toFixed(2))) : '0';
    }
  });

  dashboard.subscribe((state) => {
    if (els.dashboard) renderDashboard(els.dashboard, state);
  });

  startClock(els.clock);
  refreshOpenTicketBadge();

  // Keep catalog stock & open-ticket count current without a manual refresh.
  async function autoRefreshPos() {
    if (document.hidden) return;
    try {
      await refreshOpenTicketBadge();

      if (activeView === 'tickets') {
        await refreshTicketsList();
        return;
      }

      // Only refresh the register catalog when idle — never mid-sale or mid-modal.
      if (cart.getSnapshot().items.length) return;
      if (root.querySelector('[data-park-modal], [data-sale-modal], [data-refund-modal]')) return;

      const rows = await fetchLiveCatalogRows();
      if (rows.length) cart.resetCatalog(rows);
    } catch (err) {
      console.warn('[pos] auto-refresh skipped:', err?.message || err);
    }
  }
  window.setInterval(autoRefreshPos, 30_000);

  root.addEventListener('click', async (event) => {
    const target = event.target;

    const mtab = target.closest('[data-mtab]');
    if (mtab) {
      const which = mtab.dataset.mtab;
      if (which === 'products') await showRegisterView('products');
      else if (which === 'ticket') await showRegisterView('ticket');
      else if (which === 'tickets') await showTicketsPage();
      else if (which === 'scan') scanner.start();
      return;
    }

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
      if (productCard.disabled || productCard.classList.contains('pos-card--out-of-stock')) {
        showToast(els.toast, 'Out of stock');
        return;
      }
      const added = cart.addItem(productCard.dataset.posProduct);
      if (added) showToast(els.toast, 'Added to ticket');
      else showToast(els.toast, 'Out of stock');
      return;
    }

    if (target.closest('[data-qty-minus]')) {
      const btn = target.closest('[data-qty-minus]');
      cart.adjustQuantity(btn.dataset.productId, -1);
      return;
    }

    if (target.closest('[data-qty-plus]')) {
      const btn = target.closest('[data-qty-plus]');
      cart.adjustQuantity(btn.dataset.productId, 1);
      return;
    }

    if (target.closest('[data-remove-line]')) {
      const btn = target.closest('[data-remove-line]');
      const line = cart.getSnapshot().items.find((i) => i.productId === btn.dataset.productId);
      if (line) cart.adjustQuantity(btn.dataset.productId, -line.quantity);
      showToast(els.toast, 'Item removed');
      return;
    }

    if (target.closest('[data-clear-ticket]')) {
      cart.clear();
      activeOpenTicketId = null;
      return;
    }

    if (target.closest('[data-open-invoice]')) {
      await showInvoiceModal();
      return;
    }

    if (target.closest('[data-invoice-close]') || target.matches('[data-invoice-backdrop]')) {
      root.querySelector('[data-invoice-modal]')?.remove();
      return;
    }

    if (target.closest('[data-invoice-search]')) {
      const modal = root.querySelector('[data-invoice-modal]');
      if (modal) await loadInvoiceList(modal);
      return;
    }

    if (target.closest('[data-invoice-back]')) {
      const modal = root.querySelector('[data-invoice-modal]');
      if (modal) await loadInvoiceList(modal);
      return;
    }

    const openDetail = target.closest('[data-open-invoice-detail]');
    if (openDetail) {
      await showInvoiceDetail(openDetail.dataset.openInvoiceDetail);
      return;
    }

    if (target.closest('[data-refund-sale]')) {
      const btn = target.closest('[data-refund-sale]');
      const orderId = btn.dataset.refundSale;
      const invoice = btn.dataset.refundInvoice || orderId;
      if (!confirm(`Refund full invoice ${invoice}? Stock will be restored.`)) return;
      btn.disabled = true;
      btn.textContent = 'Refunding…';
      try {
        await refundPosOrder(orderId);
        await syncCartStockFromServer();
        root.querySelector('[data-invoice-modal]')?.remove();
        showToast(els.toast, `Refunded ${invoice} · stock restored`);
        refreshCatalog();
      } catch (err) {
        console.error('[pos] refund failed:', err);
        window.alert(err?.message || 'Refund failed.');
        btn.disabled = false;
        btn.textContent = 'Refund full invoice';
      }
      return;
    }

    if (target.closest('[data-refund-line]')) {
      const btn = target.closest('[data-refund-line]');
      const orderId = btn.dataset.refundLine;
      const itemId = btn.dataset.refundItem;
      const invoice = btn.dataset.refundInvoice || orderId;
      const label = btn.dataset.refundLabel || 'item';
      if (!confirm(`Refund “${label}” from invoice ${invoice}? Stock will be restored.`)) return;
      btn.disabled = true;
      btn.textContent = '…';
      try {
        await refundPosOrder(orderId, { orderItemId: itemId });
        await syncCartStockFromServer();
        showToast(els.toast, `Refunded ${label} · stock restored`);
        refreshCatalog();
        await showInvoiceDetail(orderId);
      } catch (err) {
        console.error('[pos] line refund failed:', err);
        window.alert(err?.message || 'Refund failed.');
        btn.disabled = false;
        btn.textContent = 'Refund item';
      }
      return;
    }

    if (target.matches('[data-park-ticket]')) {
      await parkCurrentTicket();
      return;
    }

    if (target.matches('[data-park-cancel]') || target.matches('[data-park-backdrop]')) {
      root.querySelector('[data-park-modal]')?.remove();
      return;
    }

    if (target.matches('[data-open-tickets]')) {
      await showTicketsPage();
      return;
    }

    if (target.matches('[data-tickets-back]')) {
      await showRegisterView();
      return;
    }

    if (target.matches('[data-tickets-refresh]')) {
      await refreshTicketsList();
      return;
    }

    if (target.matches('[data-close-open-tickets]') || target.matches('[data-open-tickets-backdrop]')) {
      root.querySelector('[data-open-tickets-modal]')?.remove();
      return;
    }

    const chargeParkedBtn = target.closest('[data-charge-ticket]');
    if (chargeParkedBtn) {
      await chargeParkedTicket(chargeParkedBtn.dataset.chargeTicket);
      return;
    }

    const resumeBtn = target.closest('[data-resume-ticket]');
    if (resumeBtn) {
      await resumeTicket(resumeBtn.dataset.resumeTicket);
      return;
    }

    const voidBtn = target.closest('[data-void-ticket]');
    if (voidBtn) {
      if (!confirm('Void this parked ticket and restore stock to inventory?')) return;
      try {
        await cancelOpenTicket(voidBtn.dataset.voidTicket);
        await syncCartStockFromServer();
        showToast(els.toast, 'Ticket voided · stock restored');
        root.querySelector('[data-open-tickets-modal]')?.remove();
        await refreshOpenTicketBadge();
        if (activeView === 'tickets') await refreshTicketsList();
        else await showTicketsPage();
      } catch (err) {
        window.alert(err?.message || 'Failed to void ticket.');
      }
      return;
    }

    if (target.matches('[data-checkout]')) {
      const snapshot = cart.getSnapshot();
      if (!snapshot.items.length) return;

      els.checkout.disabled = true;
      try {
        const payment = await promptPaymentMethod(root, snapshot.total);
        if (!payment) {
          els.checkout.disabled = false;
          return;
        }

        let invoiceNo = '';
        if (isSupabaseConfigured()) {
          const result = await createOrder({
            source: 'pos',
            status: 'completed',
            total_amount: snapshot.total,
            subtotal_amount: snapshot.subtotal,
            discount_amount: snapshot.discount,
            notes: snapshot.discount > 0 ? `Discount ${snapshot.discount.toFixed(2)} LYD` : null,
            staff_user_id: staff.id,
            staff_name: staff.displayName || staff.username,
            payment_method: payment.payment_method,
            payment_status: payment.payment_status,
            payment_reference: payment.payment_reference,
            payment_date: payment.payment_date,
          }, ticketItemsPayload(snapshot.items));
          invoiceNo = result?.order?.invoice_number || '';
        }

        const sale = cart.checkout();
        activeOpenTicketId = null;
        if (sale.units > 0) {
          const receiptSale = {
            ...sale,
            receiptNo: invoiceNo || `POS-${Date.now().toString(36).toUpperCase()}`,
            register: 'Register #1',
            cashier: staff.displayName || staff.username,
            staffUserId: staff.id,
            paidAt: new Date(),
            paymentMethod: payment.payment_method,
            paymentReference: payment.payment_reference || null,
            paymentDate: payment.payment_date || null,
          };
          centralState.recordPosSale({
            ...sale,
            staffUserId: staff.id,
            staffName: staff.displayName || staff.username,
            paymentMethod: payment.payment_method,
          });
          dashboard.refresh();
          showSaleComplete(root, receiptSale, els.toast);
          root.classList.remove('pos--m-ticket');
          setActiveMTab('products');
          await refreshOpenTicketBadge();
        }
      } catch (err) {
        console.error('[pos] charge failed:', err);
        window.alert(err?.message || 'Charge failed.');
        els.checkout.disabled = cart.getSnapshot().items.length === 0;
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
        <div class="pos__brand-lockup">
          ${logoImg({ className: 'pos__brand-logo', size: 'mark', alt: BRAND.name, loading: 'eager' })}
          <span class="pos__brand">${escapeHtml(BRAND.name)}</span>
        </div>
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
        <button type="button" class="pos__tickets-btn" data-open-tickets aria-label="Open tickets">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
            <path d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4V8z"/>
            <path d="M9 8v8M15 8v8"/>
          </svg>
          Tickets
          <span class="pos__badge" data-open-tickets-count hidden>0</span>
        </button>
        <button type="button" class="pos__refund-btn" data-open-invoice aria-label="Open invoices">
          Invoice
        </button>
        <button type="button" class="pos__icon-btn" data-toggle-metrics aria-label="Toggle sales metrics">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
            <path d="M4 19V5M10 19V9M16 19v-6M22 19H2"/>
          </svg>
        </button>
        <button type="button" class="pos__lock-btn" data-pos-lock>Lock</button>
      </div>
    </header>

    <div class="pos__workspace" data-register-view>
      <section class="pos__catalog" aria-label="Product catalog">
        <div class="pos__catalog-toolbar">
          <div class="pos__search-wrap">
            <svg class="pos__search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>
            </svg>
            <input type="search" class="pos__search" placeholder="Search or scan barcode…" data-search aria-label="Search products">
            <button type="button" class="pos__search-scan" data-open-scanner aria-label="Open camera scanner">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                <path d="M4 7V4h3M17 4h3v3M20 17v3h-3M7 20H4v-3"/>
                <path d="M7 12h10"/>
              </svg>
            </button>
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
          <button type="button" class="pos__ticket-clear" data-clear-ticket>Clear</button>
        </div>
        <div class="pos__line-items" data-line-items></div>
        <footer class="pos__ticket-footer">
          <div class="pos__totals-row">
            <span>Subtotal</span>
            <span data-subtotal>${formatLyd(0)}</span>
          </div>
          <label class="pos__discount-row">
            <span>Discount (LYD)</span>
            <input
              type="number"
              class="pos__discount-input"
              data-discount-input
              min="0"
              step="0.01"
              value="0"
              inputmode="decimal"
              placeholder="0"
              aria-label="Discount amount in LYD"
            >
          </label>
          <div class="pos__totals-row pos__totals-row--discount" data-discount-row hidden>
            <span>Discount</span>
            <span data-discount-amount>−${formatLyd(0)}</span>
          </div>
          <div class="pos__totals-row pos__totals-row--grand">
            <span>Total</span>
            <span data-grand-total>${formatLyd(0)}</span>
          </div>
          <div class="pos__ticket-actions">
            <button type="button" class="pos__park-btn" data-park-ticket disabled>Park</button>
            <button type="button" class="pos__checkout-btn" data-checkout disabled>Charge</button>
          </div>
          <p class="pos__checkout-hint">Park reserves stock for the customer · Charge completes the sale</p>
        </footer>
      </aside>
    </div>

    <div class="pos__tickets-host" data-tickets-view hidden></div>

    <nav class="pos__mobile-tabbar" aria-label="Register navigation">
      <button type="button" class="pos__mtab is-active" data-mtab="products">
        <span class="pos__mtab-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
            <rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/>
            <rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>
          </svg>
        </span>
        <span>Products</span>
      </button>
      <button type="button" class="pos__mtab" data-mtab="ticket">
        <span class="pos__mtab-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
            <path d="M6 2h9l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"/>
            <path d="M14 2v5h5M8 12h8M8 16h5"/>
          </svg>
          <span class="pos__mtab-badge" data-mtab-cart-count hidden>0</span>
        </span>
        <span>Ticket</span>
      </button>
      <button type="button" class="pos__mtab" data-mtab="tickets">
        <span class="pos__mtab-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
            <path d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4V8z"/>
            <path d="M9 8v8M15 8v8"/>
          </svg>
          <span class="pos__mtab-badge" data-open-tickets-count hidden>0</span>
        </span>
        <span>Parked</span>
      </button>
      <button type="button" class="pos__mtab" data-mtab="scan">
        <span class="pos__mtab-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
            <path d="M4 7V4h3M17 4h3v3M20 17v3h-3M7 20H4v-3"/><path d="M7 12h10"/>
          </svg>
        </span>
        <span>Scan</span>
      </button>
    </nav>

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
    subtotal: sale.subtotal ?? sale.revenue,
    discount: sale.discount || 0,
    cost: sale.cost,
    profit: sale.profit,
    units: sale.units,
    lines: sale.lines,
    receiptNo: sale.receiptNo,
    register: sale.register,
    cashier: sale.cashier,
    staffUserId: sale.staffUserId,
    paidAt: (sale.paidAt ?? new Date()).toISOString(),
    paymentMethod: sale.paymentMethod || null,
    paymentReference: sale.paymentReference || null,
    paymentDate: sale.paymentDate || null,
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
          Print receipt
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
  const outOfStock = product.stock <= 0;
  const lowStock = !outOfStock && product.stock <= 5;
  const stockClass = outOfStock
    ? 'pos-card--out-of-stock'
    : lowStock
      ? 'pos-card--low-stock'
      : '';
  const color = CATEGORY_COLORS[product.category] || CATEGORY_COLORS.General;
  const initial = escapeHtml(product.name.charAt(0).toUpperCase());
  const thumb = product.image
    ? `<img class="pos-card__img" src="${escapeAttr(product.image)}" alt="" loading="lazy" decoding="async">`
    : `<span class="pos-card__thumb-fallback">${initial}</span>`;
  const stockBadge = outOfStock
    ? '<span class="pos-card__stock pos-card__stock--out">Out of stock</span>'
    : lowStock
      ? `<span class="pos-card__stock">${product.stock} left</span>`
      : '';
  const stockNote = outOfStock
    ? '<p class="pos-card__oos">Out of stock</p>'
    : '';

  return `
    <button
      type="button"
      class="pos-card ${stockClass}"
      data-pos-product="${product.id}"
      role="listitem"
      ${outOfStock ? 'disabled aria-disabled="true"' : ''}
      aria-label="${escapeAttr(product.name)}, ${formatLyd(product.price)}${outOfStock ? ', out of stock' : ''}"
    >
      <div class="pos-card__thumb" style="--thumb-color:${color}" aria-hidden="true">
        ${thumb}
        ${stockBadge}
      </div>
      <div class="pos-card__info">
        <p class="pos-card__name">${escapeHtml(product.name)}</p>
        <p class="pos-card__price">${formatLyd(product.price)}</p>
        ${stockNote}
      </div>
    </button>
  `;
}

function renderLineItems(container, items) {
  if (!items.length) {
    container.innerHTML = `
      <div class="pos__empty-ticket">
        <span class="pos__empty-ticket-mark" aria-hidden="true">S</span>
        <p class="pos__empty-ticket-title">Ready for the next guest</p>
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
        <button type="button" class="pos__line-remove" data-remove-line data-product-id="${line.productId}" aria-label="Remove item from ticket">
          Remove
        </button>
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
