/**
 * Dedicated Parked Tickets page for POS.
 */
import { formatLyd } from '../shared/format.js';

/**
 * @param {object[]} tickets
 * @returns {string}
 */
export function ticketsPageHtml(tickets = []) {
  return `
    <section class="pos-tickets" data-tickets-page aria-label="Parked tickets">
      <div class="pos-tickets__header">
        <div>
          <button type="button" class="pos-tickets__back" data-tickets-back>
            ← Register
          </button>
          <h1 class="pos-tickets__title">Parked tickets</h1>
          <p class="pos-tickets__subtitle">${tickets.length} open · stock already reserved</p>
        </div>
        <button type="button" class="pos-tickets__refresh" data-tickets-refresh>Refresh</button>
      </div>

      <div class="pos-tickets__list" data-tickets-list>
        ${tickets.length ? tickets.map(ticketCardHtml).join('') : emptyTicketsHtml()}
      </div>
    </section>
  `;
}

/**
 * @param {object[]} tickets
 * @returns {string}
 */
export function ticketsListHtml(tickets = []) {
  if (!tickets.length) return emptyTicketsHtml();
  return tickets.map(ticketCardHtml).join('');
}

/**
 * @param {object} t
 * @returns {string}
 */
function ticketCardHtml(t) {
  const lines = t.order_items || [];
  const qty = lines.reduce((s, l) => s + Number(l.quantity || 0), 0);
  const when = t.parked_at || t.created_at;
  const total = Number(t.total_amount || 0);
  const down = Number(t.downpayment || 0);
  const balance = Math.max(0, total - down);
  const title = t.customer_name || t.ticket_label || `Ticket ${String(t.id).slice(0, 8)}`;

  return `
    <article class="pos-tickets__card" data-ticket-id="${escapeAttr(t.id)}">
      <div class="pos-tickets__card-main">
        <div class="pos-tickets__card-top">
          <h2 class="pos-tickets__name">${escapeHtml(title)}</h2>
          <span class="pos-tickets__due">${formatLyd(balance)} due</span>
        </div>
        <p class="pos-tickets__meta">
          ${t.customer_phone ? `<span>${escapeHtml(t.customer_phone)}</span>` : ''}
          ${t.customer_location ? `<span>${escapeHtml(t.customer_location)}</span>` : ''}
          <span>${qty} item${qty === 1 ? '' : 's'}</span>
        </p>
        <p class="pos-tickets__money">
          Total ${formatLyd(total)} · Downpayment ${formatLyd(down)}
        </p>
        <ul class="pos-tickets__lines">
          ${lines.slice(0, 6).map((line) => `
            <li>${escapeHtml(line.product_name || 'Item')} × ${Number(line.quantity || 0)} · ${formatLyd(Number(line.unit_price || 0) * Number(line.quantity || 0))}</li>
          `).join('')}
          ${lines.length > 6 ? `<li>+${lines.length - 6} more</li>` : ''}
        </ul>
        <p class="pos-tickets__time">${when ? new Date(when).toLocaleString() : ''} · ${escapeHtml(t.staff_name || 'Staff')}</p>
      </div>
      <div class="pos-tickets__card-actions">
        <button type="button" class="pos-tickets__charge" data-charge-ticket="${escapeAttr(t.id)}">Charge balance</button>
        <button type="button" class="pos-tickets__resume" data-resume-ticket="${escapeAttr(t.id)}">Resume on register</button>
        <button type="button" class="pos-tickets__void" data-void-ticket="${escapeAttr(t.id)}">Void &amp; restore stock</button>
      </div>
    </article>
  `;
}

function emptyTicketsHtml() {
  return `
    <div class="pos-tickets__empty">
      <p class="pos-tickets__empty-title">No parked tickets</p>
      <p>Park a ticket from the register to reserve stock for a customer.</p>
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
