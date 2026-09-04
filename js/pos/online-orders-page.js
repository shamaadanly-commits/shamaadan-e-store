/**
 * POS queue for website / online storefront orders.
 * Staff prepare and mark orders as sent from the register.
 */
import { formatLyd } from '../shared/format.js';

/**
 * @param {object[]} orders
 * @returns {string}
 */
export function onlineOrdersPageHtml(orders = []) {
  const active = orders.length;
  return `
    <section class="pos-tickets pos-online-orders" data-online-orders-page aria-label="Website orders">
      <div class="pos-tickets__header">
        <div>
          <button type="button" class="pos-tickets__back" data-online-orders-back>
            ← Register
          </button>
          <h1 class="pos-tickets__title">Website orders</h1>
          <p class="pos-tickets__subtitle">${active} to prepare · mark prepared, then send</p>
        </div>
        <button type="button" class="pos-tickets__refresh" data-online-orders-refresh>Refresh</button>
      </div>

      <div class="pos-tickets__list" data-online-orders-list>
        ${orders.length ? orders.map(onlineOrderCardHtml).join('') : emptyOnlineOrdersHtml()}
      </div>
    </section>
  `;
}

/**
 * @param {object[]} orders
 * @returns {string}
 */
export function onlineOrdersListHtml(orders = []) {
  if (!orders.length) return emptyOnlineOrdersHtml();
  return orders.map(onlineOrderCardHtml).join('');
}

/**
 * @param {object} order
 * @returns {string}
 */
function onlineOrderCardHtml(order) {
  const lines = order.order_items || [];
  const qty = lines.reduce((s, l) => s + Number(l.quantity || 0), 0);
  const when = order.created_at;
  const total = Number(order.total_amount || 0);
  const status = String(order.status || 'pending').toLowerCase();
  const title = order.customer_name || `Order ${String(order.id).slice(0, 8)}`;
  const address = [order.customer_address, order.customer_city, order.customer_location]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .filter((part, i, arr) => arr.indexOf(part) === i)
    .join(' · ');

  const actions = statusActionsHtml(order.id, status);

  return `
    <article class="pos-tickets__card pos-online-orders__card" data-online-order-id="${escapeAttr(order.id)}" data-status="${escapeAttr(status)}">
      <div class="pos-tickets__card-main">
        <div class="pos-tickets__card-top">
          <h2 class="pos-tickets__name">${escapeHtml(title)}</h2>
          <span class="pos-online-orders__badge pos-online-orders__badge--${escapeAttr(status)}">${escapeHtml(statusLabel(status))}</span>
        </div>
        ${order.invoice_number ? `<p class="pos-tickets__invoice"><code>${escapeHtml(order.invoice_number)}</code></p>` : ''}
        <p class="pos-tickets__meta">
          ${order.customer_phone ? `<span>${escapeHtml(order.customer_phone)}</span>` : ''}
          ${order.customer_email ? `<span>${escapeHtml(order.customer_email)}</span>` : ''}
          <span>${qty} item${qty === 1 ? '' : 's'}</span>
          <span>${escapeHtml(String(order.payment_method || 'CAD').toUpperCase())}</span>
        </p>
        ${address ? `<p class="pos-tickets__money">${escapeHtml(address)}</p>` : ''}
        <p class="pos-tickets__money">Total ${formatLyd(total)}</p>
        <ul class="pos-tickets__lines">
          ${lines.slice(0, 8).map((line) => `
            <li>${escapeHtml(line.product_name || 'Item')} × ${Number(line.quantity || 0)} · ${formatLyd(Number(line.unit_price || 0) * Number(line.quantity || 0))}</li>
          `).join('')}
          ${lines.length > 8 ? `<li>+${lines.length - 8} more</li>` : ''}
        </ul>
        <p class="pos-tickets__time">${when ? new Date(when).toLocaleString() : ''}</p>
      </div>
      <div class="pos-tickets__card-actions">
        ${actions}
      </div>
    </article>
  `;
}

/**
 * @param {string} id
 * @param {string} status
 */
function statusActionsHtml(id, status) {
  if (status === 'pending' || status === 'paid') {
    return `
      <button type="button" class="pos-tickets__charge pos-online-orders__prepare" data-prepare-online-order="${escapeAttr(id)}">Mark prepared</button>
      <p class="pos-online-orders__hint">Pack the items, then mark prepared.</p>
    `;
  }
  if (status === 'prepared') {
    return `
      <button type="button" class="pos-tickets__resume pos-online-orders__send" data-send-online-order="${escapeAttr(id)}">Mark sent</button>
      <p class="pos-online-orders__hint">Hand off / deliver, then mark sent.</p>
    `;
  }
  return `<p class="pos-online-orders__hint">No actions for this status.</p>`;
}

function statusLabel(status) {
  const map = {
    pending: 'New',
    paid: 'Paid',
    prepared: 'Prepared',
    sent: 'Sent',
    completed: 'Completed',
    cancelled: 'Cancelled',
  };
  return map[status] || status;
}

function emptyOnlineOrdersHtml() {
  return `
    <div class="pos-tickets__empty">
      <p class="pos-tickets__empty-title">No website orders to prepare</p>
      <p>New online checkouts appear here so you can prepare and send them.</p>
    </div>
  `;
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
