/**
 * POS receipt printing — Arabic thermal-friendly receipt with brand font + logo.
 */
import { formatLyd, formatPhoneArabic } from '../shared/format.js';
import { BRAND, printAssetUrls, printFontFaceCss } from '../shared/brand.js';


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
 * @property {number} [subtotal]
 * @property {number} [discount]
 * @property {number} cost
 * @property {number} profit
 * @property {number} units
 * @property {ReceiptLine[]} lines
 * @property {string} [receiptNo]
 * @property {string} [register]
 * @property {string} [cashier]
 * @property {Date|string} [paidAt]
 * @property {string} [paymentMethod]
 * @property {string|null} [paymentReference]
 * @property {string|null} [paymentDate]
 */

/**
 * @param {string} method
 */
function paymentMethodLabel(method) {
  const m = String(method || '').toLowerCase();
  if (m === 'cash') return 'نقداً';
  if (m === 'bank_transfer' || m === 'bank-transfer' || m === 'transfer') return 'تحويل بنكي';
  return method ? String(method) : '';
}

/**
 * @param {SaleReceipt} sale
 * @returns {string}
 */
export function buildReceiptHtml(sale) {
  const { logo, font } = printAssetUrls();
  const paidAt = sale.paidAt ? new Date(sale.paidAt) : new Date();
  const receiptNo = sale.receiptNo ?? `R${Date.now().toString(36).toUpperCase()}`;
  const register = sale.register ?? 'صندوق #1';
  const cashier = sale.cashier || '';
  const when = paidAt.toLocaleString('ar-LY', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  const subtotal = Number(sale.subtotal);
  const discount = Math.max(0, Number(sale.discount) || 0);
  const total = Number(sale.revenue) || 0;
  const shownSubtotal = Number.isFinite(subtotal) && subtotal > 0
    ? subtotal
    : (discount > 0 ? total + discount : total);

  const payLabel = paymentMethodLabel(sale.paymentMethod);
  const payRef = String(sale.paymentReference || '').trim();
  const payDate = String(sale.paymentDate || '').trim();

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
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>إيصال ${escapeHtml(receiptNo)}</title>
  <style>
    ${printFontFaceCss(font)}
    @page { size: 80mm auto; margin: 4mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: 'Iwanzaza Personal', Tahoma, "Segoe UI", sans-serif;
      font-size: 13px;
      color: #111;
      background: #fff;
      direction: rtl;
    }
    .receipt {
      width: 72mm;
      max-width: 100%;
      margin: 0 auto;
      padding: 4mm 2mm 8mm;
    }
    .center { text-align: center; }
    .logo-mark {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 30mm;
      height: 30mm;
      margin: 0 auto 8px;
      background: #111;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .logo {
      display: block;
      width: 82%;
      height: 82%;
      object-fit: contain;
      object-position: center;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .brand {
      font-size: 20px;
      font-weight: 400;
      letter-spacing: 0.02em;
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
    td.amt { text-align: left; white-space: nowrap; font-weight: 700; }
    .name { font-weight: 700; }
    .meta { color: #444; font-size: 11px; margin-top: 1px; }
    .totals td { padding: 3px 0; }
    .totals .grand td {
      font-size: 15px;
      font-weight: 800;
      padding-top: 8px;
      border-top: 2px solid #111;
    }
    .pay {
      margin: 0;
      font-size: 11px;
      color: #111;
    }
    .pay strong { font-weight: 800; }
    .thanks {
      margin-top: 12px;
      text-align: center;
      font-size: 13px;
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
      <div class="logo-mark">
        <img class="logo" src="${logo}" alt="${escapeHtml(BRAND.nameAr)}" width="120" height="120">
      </div>
      <p class="brand">${escapeHtml(BRAND.nameAr)}</p>
      <p class="muted">عطور ومستلزمات المنزل</p>
      <p class="muted">${escapeHtml(register)}</p>
      ${cashier ? `<p class="muted">الكاشير: ${escapeHtml(cashier)}</p>` : ''}
    </div>
    <hr class="rule">
    <p class="muted">رقم الإيصال: <strong>${escapeHtml(receiptNo)}</strong></p>
    <p class="muted">${escapeHtml(when)}</p>
    <hr class="rule">
    <table>
      <tbody>${rows}</tbody>
    </table>
    <hr class="rule">
    <table class="totals">
      <tr>
        <td>عدد الأصناف</td>
        <td class="amt">${sale.units}</td>
      </tr>
      <tr>
        <td>المجموع الفرعي</td>
        <td class="amt">${formatLyd(shownSubtotal)}</td>
      </tr>
      ${discount > 0 ? `
      <tr>
        <td>الخصم</td>
        <td class="amt">−${formatLyd(discount)}</td>
      </tr>` : ''}
      <tr class="grand">
        <td>الإجمالي</td>
        <td class="amt">${formatLyd(total)}</td>
      </tr>
    </table>
    ${payLabel || payRef || payDate ? `
    <hr class="rule">
    <p class="pay"><strong>الدفع:</strong> ${escapeHtml(payLabel || '—')}</p>
    ${payRef ? `<p class="pay"><strong>رقم العملية:</strong> ${escapeHtml(payRef)}</p>` : ''}
    ${payDate ? `<p class="pay"><strong>تاريخ التحويل:</strong> ${escapeHtml(payDate)}</p>` : ''}
    ` : ''}
    <p class="thanks">شكراً لتسوقكم من شمعدان</p>
    <p class="muted center" style="margin-top:8px;">هاتف ${escapeHtml(formatPhoneArabic(BRAND.phone))}</p>
    <div class="actions">
      <button type="button" onclick="window.print()">طباعة الإيصال</button>
      <button type="button" class="secondary" onclick="window.close()">إغلاق</button>
    </div>
  </div>
  <script>
    function goPrint() {
      setTimeout(function () { window.print(); }, 200);
    }
    window.addEventListener('load', function () {
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(goPrint).catch(goPrint);
      } else {
        goPrint();
      }
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
  return openPrintWindow(buildReceiptHtml(sale), 'shamaadan-receipt');
}

/**
 * @typedef {object} RefundReceipt
 * @property {string} [invoiceNumber]
 * @property {number} amount
 * @property {boolean} [partial]
 * @property {boolean} [fullyRefunded]
 * @property {Date|string} [refundedAt]
 * @property {string} [cashier]
 * @property {string} [paymentMethod]
 * @property {Array<{ title: string, quantity: number, unitPrice: number }>} lines
 */

/**
 * Arabic refund invoice — same brand look as the sale receipt.
 * @param {RefundReceipt} refund
 * @returns {string}
 */
export function buildRefundReceiptHtml(refund) {
  const { logo, font } = printAssetUrls();
  const when = refund.refundedAt
    ? new Date(refund.refundedAt)
    : new Date();
  const whenLabel = when.toLocaleString('ar-LY', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const invoice = refund.invoiceNumber || `RF${Date.now().toString(36).toUpperCase()}`;
  const cashier = refund.cashier || '';
  const amount = Number(refund.amount) || 0;
  const lines = refund.lines || [];
  const units = lines.reduce((sum, line) => sum + (Number(line.quantity) || 0), 0);
  const kind = refund.fullyRefunded
    ? 'استرداد كامل'
    : (refund.partial ? 'استرداد جزئي' : 'استرداد');
  const payLabel = paymentMethodLabel(refund.paymentMethod);

  const rows = lines.map((line) => {
    const qty = Number(line.quantity) || 0;
    const unit = Number(line.unitPrice) || 0;
    const lineTotal = qty * unit;
    return `
      <tr>
        <td class="item">
          <div class="name">${escapeHtml(line.title)}</div>
          <div class="meta">${qty} × ${formatLyd(unit)}</div>
        </td>
        <td class="amt">${formatLyd(lineTotal)}</td>
      </tr>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>فاتورة مرتجع ${escapeHtml(invoice)}</title>
  <style>
    ${printFontFaceCss(font)}
    @page { size: 80mm auto; margin: 4mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: 'Iwanzaza Personal', Tahoma, "Segoe UI", sans-serif;
      font-size: 13px;
      color: #111;
      background: #fff;
      direction: rtl;
    }
    .receipt {
      width: 72mm;
      max-width: 100%;
      margin: 0 auto;
      padding: 4mm 2mm 8mm;
    }
    .center { text-align: center; }
    .logo-mark {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 30mm;
      height: 30mm;
      margin: 0 auto 8px;
      background: #111;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .logo {
      display: block;
      width: 82%;
      height: 82%;
      object-fit: contain;
      object-position: center;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .brand {
      font-size: 20px;
      font-weight: 400;
      letter-spacing: 0.02em;
      margin: 0 0 2px;
    }
    .badge {
      display: inline-block;
      margin: 6px 0 2px;
      padding: 3px 10px;
      border: 1.5px solid #111;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
    }
    .muted { color: #444; font-size: 11px; }
    .rule {
      border: 0;
      border-top: 1px dashed #111;
      margin: 10px 0;
    }
    table { width: 100%; border-collapse: collapse; }
    td { vertical-align: top; padding: 4px 0; }
    td.amt { text-align: left; white-space: nowrap; font-weight: 700; }
    .name { font-weight: 700; }
    .meta { color: #444; font-size: 11px; margin-top: 1px; }
    .totals td { padding: 3px 0; }
    .totals .grand td {
      font-size: 15px;
      font-weight: 800;
      padding-top: 8px;
      border-top: 2px solid #111;
    }
    .pay { margin: 0; font-size: 11px; }
    .thanks {
      margin-top: 12px;
      text-align: center;
      font-size: 13px;
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
      <div class="logo-mark">
        <img class="logo" src="${logo}" alt="${escapeHtml(BRAND.nameAr)}" width="120" height="120">
      </div>
      <p class="brand">${escapeHtml(BRAND.nameAr)}</p>
      <p class="badge">فاتورة مرتجع · ${escapeHtml(kind)}</p>
      <p class="muted">عطور ومستلزمات المنزل</p>
      ${cashier ? `<p class="muted">الكاشير: ${escapeHtml(cashier)}</p>` : ''}
    </div>
    <hr class="rule">
    <p class="muted">فاتورة البيع: <strong>${escapeHtml(invoice)}</strong></p>
    <p class="muted">تاريخ الاسترداد: ${escapeHtml(whenLabel)}</p>
    <hr class="rule">
    <table>
      <tbody>${rows || '<tr><td colspan="2">لا توجد أصناف.</td></tr>'}</tbody>
    </table>
    <hr class="rule">
    <table class="totals">
      <tr>
        <td>عدد الأصناف المستردة</td>
        <td class="amt">${units}</td>
      </tr>
      <tr class="grand">
        <td>مبلغ الاسترداد</td>
        <td class="amt">${formatLyd(amount)}</td>
      </tr>
    </table>
    ${payLabel ? `
    <hr class="rule">
    <p class="pay"><strong>طريقة الدفع الأصلية:</strong> ${escapeHtml(payLabel)}</p>
    ` : ''}
    <p class="thanks">تم إرجاع المبلغ للعميل</p>
    <p class="muted center" style="margin-top:8px;">هاتف ${escapeHtml(formatPhoneArabic(BRAND.phone))}</p>
    <div class="actions">
      <button type="button" onclick="window.print()">طباعة فاتورة المرتجع</button>
      <button type="button" class="secondary" onclick="window.close()">إغلاق</button>
    </div>
  </div>
  <script>
    function goPrint() {
      setTimeout(function () { window.print(); }, 200);
    }
    window.addEventListener('load', function () {
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(goPrint).catch(goPrint);
      } else {
        goPrint();
      }
    });
  </script>
</body>
</html>`;
}

/**
 * Open a printable refund invoice window.
 * @param {RefundReceipt} refund
 * @returns {Window | null}
 */
export function printRefundReceipt(refund) {
  return openPrintWindow(buildRefundReceiptHtml(refund), 'shamaadan-refund');
}

/**
 * @param {string} html
 * @param {string} name
 * @returns {Window | null}
 */
function openPrintWindow(html, name) {
  const win = window.open('', name, 'width=420,height=720');

  if (win) {
    win.document.open();
    win.document.write(html);
    win.document.close();
    try {
      win.focus();
    } catch {
      /* ignore */
    }
    return win;
  }

  // Mobile / PWA often block popups — print from a hidden iframe instead.
  try {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('title', 'Print');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;';
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) {
      document.body.removeChild(iframe);
      alert('اسمح بالنوافذ المنبثقة لطباعة الفاتورة.');
      return null;
    }
    doc.open();
    doc.write(html);
    doc.close();
    const trigger = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch {
        /* ignore */
      }
      setTimeout(() => {
        try {
          document.body.removeChild(iframe);
        } catch {
          /* ignore */
        }
      }, 60_000);
    };
    if (doc.fonts?.ready) {
      doc.fonts.ready.then(trigger).catch(trigger);
    } else {
      setTimeout(trigger, 400);
    }
    return iframe.contentWindow;
  } catch {
    alert('اسمح بالنوافذ المنبثقة لطباعة الفاتورة.');
    return null;
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
