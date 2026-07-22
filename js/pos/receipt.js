/**
 * POS receipt printing — opens a thermal-friendly receipt window.
 */
import { formatLyd } from '../shared/format.js';

/**
 * @typedef {object} ReceiptLine
 * @property {string} title
 * @property {number} quantity
 * @property {number} unitPrice
 * @property {number} [unit_cost_at_sale]
 */

/**
 * @typedef {object} SaleReceipt
 * @property {number} revenue
 * @property {number} cost
 * @property {number} profit
 * @property {number} units
 * @property {ReceiptLine[]} lines
 * @property {string} [receiptNo]
 * @property {string} [register]
 * @property {string} [cashier]
 * @property {Date} [paidAt]
 */

/**
 * @param {SaleReceipt} sale
 * @returns {string}
 */
export function buildReceiptHtml(sale) {
  const paidAt = sale.paidAt ?? new Date();
  const receiptNo = sale.receiptNo ?? `R${Date.now().toString(36).toUpperCase()}`;
  const register = sale.register ?? 'Register #1';
  const cashier = sale.cashier || '';
  const when = paidAt.toLocaleString('en-LY', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  const rows = (sale.lines || []).map((line) => {
    const lineTotal = line.unitPrice * line.quantity;
    return `
      <tr>
        <td class="item">
          <div class="name">${escapeHtml(line.title)}</div>
          <div class="meta">${line.quantity} × ${formatLyd(line.unitPrice)}</div>
        </td>
        <td class="amt">${formatLyd(lineTotal)}</td>
      </tr>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Receipt ${escapeHtml(receiptNo)}</title>
  <style>
    @page { size: 80mm auto; margin: 4mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 12px;
      color: #111;
      background: #fff;
    }
    .receipt {
      width: 72mm;
      max-width: 100%;
      margin: 0 auto;
      padding: 4mm 2mm 8mm;
    }
    .center { text-align: center; }
    .brand {
      font-size: 18px;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      margin: 0 0 2px;
    }
    .muted { color: #444; font-size: 11px; }
    .rule {
      border: 0;
      border-top: 1px dashed #111;
      margin: 10px 0;
    }
    table { width: 100%; border-collapse: collapse; }
    td { vertical-align: top; padding: 4px 0; }
    td.amt { text-align: right; white-space: nowrap; font-weight: 700; }
    .name { font-weight: 700; }
    .meta { color: #444; font-size: 11px; margin-top: 1px; }
    .totals td { padding: 3px 0; }
    .totals .grand td {
      font-size: 14px;
      font-weight: 800;
      padding-top: 8px;
      border-top: 2px solid #111;
    }
    .thanks {
      margin-top: 12px;
      text-align: center;
      font-size: 12px;
    }
    .actions {
      display: flex;
      gap: 8px;
      justify-content: center;
      margin: 16px 0 8px;
    }
    .actions button {
      font: inherit;
      font-weight: 700;
      padding: 10px 16px;
      border: 1px solid #111;
      border-radius: 8px;
      background: #111;
      color: #fff;
      cursor: pointer;
    }
    .actions button.secondary {
      background: #fff;
      color: #111;
    }
    @media print {
      .actions { display: none !important; }
      body { background: #fff; }
    }
  </style>
</head>
<body>
  <div class="receipt">
    <div class="center">
      <p class="brand">Shamaadan</p>
      <p class="muted">Fragrance &amp; Home Rituals</p>
      <p class="muted">${escapeHtml(register)}</p>
      ${cashier ? `<p class="muted">Cashier: ${escapeHtml(cashier)}</p>` : ''}
    </div>
    <hr class="rule">
    <p class="muted">Receipt: <strong>${escapeHtml(receiptNo)}</strong></p>
    <p class="muted">${escapeHtml(when)}</p>
    <hr class="rule">
    <table>
      <tbody>${rows}</tbody>
    </table>
    <hr class="rule">
    <table class="totals">
      <tr>
        <td>Items</td>
        <td class="amt">${sale.units}</td>
      </tr>
      <tr>
        <td>Subtotal</td>
        <td class="amt">${formatLyd(Number(sale.subtotal ?? sale.revenue) || 0)}</td>
      </tr>
      ${Number(sale.discount) > 0 ? `
      <tr>
        <td>Discount</td>
        <td class="amt">−${formatLyd(Number(sale.discount) || 0)}</td>
      </tr>` : ''}
      <tr class="grand">
        <td>TOTAL</td>
        <td class="amt">${formatLyd(sale.revenue)}</td>
      </tr>
    </table>
    <p class="thanks">Thank you for shopping with Shamaadan</p>
    <div class="actions">
      <button type="button" onclick="window.print()">Print receipt</button>
      <button type="button" class="secondary" onclick="window.close()">Close</button>
    </div>
  </div>
  <script>
    window.addEventListener('load', function () {
      setTimeout(function () { window.print(); }, 250);
    });
  </script>
</body>
</html>`;
}

/**
 * Open a printable receipt window for the completed sale.
 * @param {SaleReceipt} sale
 * @returns {Window | null}
 */
export function printReceipt(sale) {
  const html = buildReceiptHtml(sale);
  const win = window.open('', 'shamaadan-receipt', 'width=420,height=720');

  if (!win) {
    // Popup blocked — fall back to same-tab print via blob URL
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const fallback = window.open(url, '_blank');
    if (!fallback) {
      alert('Allow pop-ups to print the receipt, or use the Print button after checkout.');
      URL.revokeObjectURL(url);
      return null;
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return fallback;
  }

  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  return win;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
