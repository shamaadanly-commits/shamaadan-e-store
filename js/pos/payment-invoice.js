/**
 * POS payment tender + invoice / refund modals.
 */
import { formatLyd } from '../shared/format.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/'/g, '&#39;');
}

function todayLocalDate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Ask cashier for Cash or Bank Transfer before completing a charge.
 * @param {HTMLElement} root
 * @param {number} amount
 * @returns {Promise<{ payment_method: string, payment_reference: string | null, payment_date: string, payment_status: string, amount: number } | null>}
 */
export function promptPaymentMethod(root, amount) {
  return new Promise((resolve) => {
    root.querySelector('[data-pay-modal]')?.remove();
    const total = Number(amount) || 0;
    const today = todayLocalDate();

    const modal = document.createElement('div');
    modal.className = 'pos-sale-modal';
    modal.dataset.payModal = '';
    modal.innerHTML = `
      <div class="pos-sale-modal__backdrop" data-pay-backdrop></div>
      <div class="pos-sale-modal__card pos-pay-modal" role="dialog" aria-modal="true" aria-labelledby="pos-pay-title">
        <p class="pos-sale-modal__badge">Payment</p>
        <h2 id="pos-pay-title">How was this paid?</h2>
        <p class="pos-pay-modal__total">${formatLyd(total)}</p>
        <div class="pos-pay-modal__methods" role="group" aria-label="Payment method">
          <button type="button" class="pos-pay-modal__method is-selected" data-pay-method="cash">Cash</button>
          <button type="button" class="pos-pay-modal__method" data-pay-method="bank_transfer">Bank Transfer</button>
        </div>
        <div class="pos-pay-modal__bank" data-pay-bank>
          <label class="pos-pay-modal__field">
            <span>Transaction number</span>
            <input type="text" data-pay-ref autocomplete="off" placeholder="Bank reference / txn #">
          </label>
          <label class="pos-pay-modal__field">
            <span>Date</span>
            <input type="date" data-pay-date value="${escapeAttr(today)}" readonly>
          </label>
          <label class="pos-pay-modal__field">
            <span>Amount</span>
            <input type="number" data-pay-amount min="0" step="0.01" value="${escapeAttr(String(total.toFixed(2)))}" inputmode="decimal">
          </label>
        </div>
        <p class="pos-pay-modal__error" data-pay-error hidden></p>
        <div class="pos-pay-modal__actions">
          <button type="button" class="pos-sale-modal__skip" data-pay-cancel>Cancel</button>
          <button type="button" class="pos-pay-modal__submit" data-pay-confirm>Complete charge</button>
        </div>
      </div>
    `;
    root.appendChild(modal);

    let method = 'cash';
    const bankBox = modal.querySelector('[data-pay-bank]');
    const errorEl = modal.querySelector('[data-pay-error]');
    const refInput = modal.querySelector('[data-pay-ref]');

    function setMethod(next) {
      method = next === 'bank_transfer' ? 'bank_transfer' : 'cash';
      modal.querySelectorAll('[data-pay-method]').forEach((btn) => {
        btn.classList.toggle('is-selected', btn.dataset.payMethod === method);
      });
      if (bankBox) {
        bankBox.classList.toggle('is-open', method === 'bank_transfer');
        bankBox.setAttribute('aria-hidden', method === 'bank_transfer' ? 'false' : 'true');
      }
      if (errorEl) errorEl.hidden = true;
      if (method === 'bank_transfer') {
        window.setTimeout(() => refInput?.focus(), 0);
      }
    }

    setMethod('cash');

    function close(result) {
      modal.remove();
      resolve(result);
    }

    modal.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      if (target.matches('[data-pay-cancel]') || target.matches('[data-pay-backdrop]')) {
        close(null);
        return;
      }

      const methodBtn = target.closest('[data-pay-method]');
      if (methodBtn) {
        event.preventDefault();
        event.stopPropagation();
        setMethod(methodBtn.getAttribute('data-pay-method') || 'cash');
        return;
      }

      if (target.closest('[data-pay-confirm]')) {
        event.preventDefault();
        event.stopPropagation();
        if (method === 'bank_transfer') {
          const ref = String(modal.querySelector('[data-pay-ref]')?.value || '').trim();
          const date = String(modal.querySelector('[data-pay-date]')?.value || today).slice(0, 10);
          const paid = Number(modal.querySelector('[data-pay-amount]')?.value);
          if (!ref) {
            if (errorEl) {
              errorEl.textContent = 'Enter the bank transaction number.';
              errorEl.hidden = false;
            }
            refInput?.focus();
            return;
          }
          if (!Number.isFinite(paid) || paid <= 0) {
            if (errorEl) {
              errorEl.textContent = 'Enter a valid transfer amount.';
              errorEl.hidden = false;
            }
            return;
          }
          close({
            payment_method: 'bank_transfer',
            payment_reference: ref,
            payment_date: date || today,
            payment_status: 'paid',
            amount: paid,
          });
          return;
        }

        close({
          payment_method: 'cash',
          payment_reference: null,
          payment_date: today,
          payment_status: 'paid',
          amount: total,
        });
      }
    });
  });
}

/**
 * Ask for admin PIN before opening invoices.
 * @param {HTMLElement} root
 * @param {(pin: string) => Promise<{ ok: boolean, error?: string }>} verify
 * @returns {Promise<boolean>}
 */
export function promptAdminPin(root, verify) {
  return new Promise((resolve) => {
    root.querySelector('[data-admin-pin-modal]')?.remove();
    const modal = document.createElement('div');
    modal.className = 'pos-sale-modal';
    modal.dataset.adminPinModal = '';
    modal.innerHTML = `
      <div class="pos-sale-modal__backdrop" data-admin-pin-backdrop></div>
      <div class="pos-sale-modal__card pos-admin-pin" role="dialog" aria-modal="true" aria-labelledby="pos-admin-pin-title">
        <p class="pos-sale-modal__badge">Admin</p>
        <h2 id="pos-admin-pin-title">Enter admin PIN</h2>
        <p class="pos-admin-pin__hint">Required to open invoices and process refunds.</p>
        <label class="pos-pay-modal__field">
          <span>Admin PIN</span>
          <input type="password" data-admin-pin-input inputmode="numeric" autocomplete="off" placeholder="••••">
        </label>
        <p class="pos-pay-modal__error" data-admin-pin-error hidden></p>
        <div class="pos-pay-modal__actions">
          <button type="button" class="pos-sale-modal__skip" data-admin-pin-cancel>Cancel</button>
          <button type="button" class="pos-pay-modal__submit" data-admin-pin-confirm>Confirm</button>
        </div>
      </div>
    `;
    root.appendChild(modal);
    const input = modal.querySelector('[data-admin-pin-input]');
    const errorEl = modal.querySelector('[data-admin-pin-error]');
    input?.focus();

    function close(ok) {
      modal.remove();
      resolve(ok);
    }

    async function submit() {
      const pin = String(input?.value || '').trim();
      if (!pin) {
        if (errorEl) {
          errorEl.textContent = 'Enter admin PIN.';
          errorEl.hidden = false;
        }
        return;
      }
      const confirmBtn = modal.querySelector('[data-admin-pin-confirm]');
      if (confirmBtn) confirmBtn.disabled = true;
      try {
        const result = await verify(pin);
        if (!result.ok) {
          if (errorEl) {
            errorEl.textContent = result.error || 'Invalid admin PIN';
            errorEl.hidden = false;
          }
          if (confirmBtn) confirmBtn.disabled = false;
          return;
        }
        close(true);
      } catch (err) {
        if (errorEl) {
          errorEl.textContent = err?.message || 'Could not verify PIN';
          errorEl.hidden = false;
        }
        if (confirmBtn) confirmBtn.disabled = false;
      }
    }

    modal.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.matches('[data-admin-pin-cancel]') || target.matches('[data-admin-pin-backdrop]')) {
        close(false);
        return;
      }
      if (target.matches('[data-admin-pin-confirm]')) submit();
    });

    input?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        submit();
      }
    });
  });
}

/**
 * @param {object} sale
 */
function invoiceRowHtml(sale) {
  const lines = sale.order_items || [];
  const qty = lines.reduce((sum, line) => {
    const remaining = Math.max(0, (Number(line.quantity) || 0) - (Number(line.refunded_quantity) || 0));
    return sum + remaining;
  }, 0);
  const when = sale.completed_at || sale.created_at;
  const invoice = sale.invoice_number || String(sale.id).slice(0, 8);
  const method = String(sale.payment_method || '').toLowerCase();
  const methodLabel = method === 'cash'
    ? 'Cash'
    : (method === 'bank_transfer' || method === 'bank-transfer' ? 'Bank transfer' : '—');
  const status = String(sale.status || '');
  const canRefund = status === 'completed' && qty > 0;

  return `
    <div class="pos-refund-modal__item" data-invoice-row="${escapeAttr(sale.id)}">
      <div>
        <p class="pos-refund-modal__invoice">${escapeHtml(invoice)}</p>
        <p class="pos-refund-modal__meta">
          ${formatLyd(Number(sale.total_amount || 0))}
          · ${qty} item${qty === 1 ? '' : 's'}
          · ${escapeHtml(methodLabel)}
          · ${escapeHtml(sale.staff_name || 'Staff')}
          ${when ? ` · ${escapeHtml(new Date(when).toLocaleString('en-LY'))}` : ''}
          ${status === 'refunded' ? ' · Refunded' : ''}
        </p>
      </div>
      <button
        type="button"
        class="pos-refund-modal__btn ${canRefund ? '' : 'pos-refund-modal__btn--muted'}"
        data-open-invoice-detail="${escapeAttr(sale.id)}"
        ${canRefund ? '' : 'disabled'}
      >${canRefund ? 'Open' : 'Done'}</button>
    </div>`;
}

/**
 * @param {object} sale
 */
export function invoiceDetailHtml(sale) {
  const invoice = sale.invoice_number || String(sale.id).slice(0, 8);
  const lines = sale.order_items || [];
  const lineRows = lines.map((line) => {
    const qty = Number(line.quantity) || 0;
    const refunded = Number(line.refunded_quantity) || 0;
    const remaining = Math.max(0, qty - refunded);
    const unit = Number(line.unit_price) || 0;
    const disabled = remaining <= 0;
    return `
      <div class="pos-invoice-line">
        <div>
          <p class="pos-invoice-line__name">${escapeHtml(line.product_name || 'Item')}</p>
          <p class="pos-invoice-line__meta">
            ${remaining} of ${qty} left · ${formatLyd(unit)} each
            ${refunded ? ` · ${refunded} refunded` : ''}
          </p>
        </div>
        <button
          type="button"
          class="pos-refund-modal__btn pos-refund-modal__btn--line"
          data-refund-line="${escapeAttr(sale.id)}"
          data-refund-item="${escapeAttr(line.id)}"
          data-refund-invoice="${escapeAttr(invoice)}"
          data-refund-label="${escapeAttr(line.product_name || 'Item')}"
          ${disabled ? 'disabled' : ''}
        >Refund item</button>
      </div>`;
  }).join('');

  const anyLeft = lines.some((line) => {
    const qty = Number(line.quantity) || 0;
    const refunded = Number(line.refunded_quantity) || 0;
    return qty - refunded > 0;
  });

  return `
    <div class="pos-invoice-detail" data-invoice-detail>
      <button type="button" class="pos-invoice-detail__back" data-invoice-back>← Back to invoices</button>
      <h3 class="pos-invoice-detail__title">${escapeHtml(invoice)}</h3>
      <p class="pos-refund-modal__meta">
        ${formatLyd(Number(sale.total_amount || 0))}
        · ${escapeHtml(sale.payment_method === 'bank_transfer' ? 'Bank transfer' : (sale.payment_method || '—'))}
        ${sale.payment_reference ? ` · Txn ${escapeHtml(sale.payment_reference)}` : ''}
      </p>
      <div class="pos-invoice-detail__lines">${lineRows || '<p class="pos-refund-modal__empty">No line items.</p>'}</div>
      <button
        type="button"
        class="pos-pay-modal__submit pos-invoice-detail__full"
        data-refund-sale="${escapeAttr(sale.id)}"
        data-refund-invoice="${escapeAttr(invoice)}"
        ${anyLeft ? '' : 'disabled'}
      >Refund full invoice</button>
    </div>`;
}

/**
 * Build invoices modal shell HTML.
 * @param {{ from: string, to: string }} range
 */
export function invoicesModalHtml(range) {
  return `
    <div class="pos-sale-modal__backdrop" data-invoice-backdrop></div>
    <div class="pos-sale-modal__card pos-refund-modal pos-invoice-modal" role="dialog" aria-modal="true" aria-labelledby="pos-invoice-title">
      <p class="pos-sale-modal__badge">Invoices</p>
      <h2 id="pos-invoice-title">POS invoices</h2>
      <p class="pos-refund-modal__hint">Search by date, open an invoice, then refund the full sale or one item.</p>
      <div class="pos-invoice-filters">
        <label class="pos-pay-modal__field">
          <span>From</span>
          <input type="date" data-invoice-from value="${escapeAttr(range.from)}">
        </label>
        <label class="pos-pay-modal__field">
          <span>To</span>
          <input type="date" data-invoice-to value="${escapeAttr(range.to)}">
        </label>
        <button type="button" class="pos-refund-modal__btn" data-invoice-search>Search</button>
      </div>
      <div class="pos-refund-modal__list" data-invoice-list>
        <p class="pos-refund-modal__loading">Loading…</p>
      </div>
      <button type="button" class="pos-sale-modal__skip" data-invoice-close>Close</button>
    </div>`;
}

/**
 * @param {object[]} sales
 */
export function invoicesListHtml(sales) {
  const refundable = (sales || []).filter((s) => s.status === 'completed' || s.status === 'refunded');
  if (!refundable.length) {
    return '<p class="pos-refund-modal__empty">No invoices in this date range.</p>';
  }
  return refundable.map(invoiceRowHtml).join('');
}

export { todayLocalDate, escapeHtml, escapeAttr };
