/**
 * Printable website order invoice — Arabic, brand font + logo.
 */
import { formatLyd } from '../shared/format.js';
import { BRAND, printAssetUrls, printFontFaceCss } from '../shared/brand.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function paymentLabel(method) {
  const m = String(method || '').toLowerCase();
  if (m === 'cad') return 'الدفع عند الاستلام';
  if (m === 'upay' || m === 'credit') return 'بطاقة / ائتمان';
  return method ? String(method).toUpperCase() : '—';
}

function statusLabel(status) {
  const map = {
    pending: 'قيد الانتظار',
    paid: 'مدفوع',
    completed: 'مكتمل',
    cancelled: 'ملغى',
    refunded: 'مسترد',
  };
  const s = String(status || '').toLowerCase();
  return map[s] || (s ? s : '—');
}

/**
 * @param {object} order
 * @param {object[]} [items]
 * @returns {string}
 */
export function buildWebsiteOrderPrintHtml(order, items = []) {
  const { logo, font } = printAssetUrls();
  const invoice = order?.invoice_number || order?.id || 'طلب';
  const when = order?.created_at
    ? new Date(order.created_at).toLocaleString('ar-LY', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
    : '—';

  const rows = (items || []).map((it) => {
    const qty = Number(it.quantity || 0);
    const unit = Number(it.unit_price || 0);
    const line = qty * unit;
    return `
      <tr>
        <td>
          <div class="name">${escapeHtml(it.product_name || 'صنف')}</div>
        </td>
        <td class="num">${escapeHtml(qty)}</td>
        <td class="num">${escapeHtml(formatLyd(unit))}</td>
        <td class="num">${escapeHtml(formatLyd(line))}</td>
      </tr>`;
  }).join('');

  const address = [order?.customer_address, order?.customer_city].filter(Boolean).join('، ') || '—';
  const subtotal = Number(order?.subtotal_amount ?? order?.total_amount ?? 0);
  const shipping = Number(order?.shipping_amount || 0);
  const total = Number(order?.total_amount || 0);

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>طلب ${escapeHtml(invoice)}</title>
  <style>
    ${printFontFaceCss(font)}
    :root {
      color-scheme: light;
      --ink: #1c1914;
      --muted: #6b645b;
      --line: #ddd6cb;
      --gold: #7d651a;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 24px;
      font-family: 'Iwanzaza Personal', Tahoma, "Segoe UI", sans-serif;
      color: var(--ink);
      background: #fff;
      font-size: 15px;
      line-height: 1.55;
      direction: rtl;
    }
    .sheet { max-width: 720px; margin: 0 auto; }
    .top {
      display: flex;
      justify-content: space-between;
      gap: 1.5rem;
      align-items: flex-start;
      border-bottom: 2px solid var(--ink);
      padding-bottom: 1rem;
      margin-bottom: 1.25rem;
    }
    .brand-block { display: flex; align-items: center; gap: 0.85rem; }
    .logo {
      width: auto;
      max-width: 88px;
      height: 56px;
      object-fit: contain;
      object-position: center;
      flex-shrink: 0;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .brand { font-size: 1.85rem; letter-spacing: 0.02em; margin: 0; }
    .brand span {
      display: block;
      margin-top: 0.35rem;
      font-size: 0.85rem;
      color: var(--muted);
    }
    .meta { text-align: left; font-size: 0.95rem; }
    .meta strong { display: block; font-size: 1.15rem; margin-bottom: 0.25rem; }
    h2 {
      margin: 0 0 0.55rem;
      font-size: 0.85rem;
      color: var(--muted);
      font-weight: 700;
    }
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1.25rem;
      margin-bottom: 1.5rem;
    }
    .card {
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 0.9rem 1rem;
      min-height: 7rem;
    }
    .card p { margin: 0.25rem 0; }
    .label { color: var(--muted); font-size: 0.82rem; margin-left: 0.35rem; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 1.25rem; }
    th, td { padding: 0.65rem 0.35rem; border-bottom: 1px solid var(--line); vertical-align: top; }
    th {
      text-align: right;
      font-size: 0.82rem;
      color: var(--muted);
    }
    .num { text-align: left; white-space: nowrap; font-variant-numeric: tabular-nums; }
    th.num { text-align: left; }
    .name { font-weight: 600; }
    .totals { width: min(300px, 100%); margin-right: auto; margin-left: 0; }
    .totals .row { display: flex; justify-content: space-between; gap: 1rem; padding: 0.3rem 0; }
    .totals .grand {
      margin-top: 0.45rem;
      padding-top: 0.55rem;
      border-top: 2px solid var(--ink);
      font-size: 1.15rem;
      font-weight: 700;
    }
    .totals .grand span:last-child { color: var(--gold); }
    .footer {
      margin-top: 2rem;
      padding-top: 1rem;
      border-top: 1px solid var(--line);
      color: var(--muted);
      font-size: 0.88rem;
    }
    .actions { display: flex; gap: 0.6rem; margin-bottom: 1.25rem; }
    .actions button {
      border: 1px solid var(--ink);
      background: var(--ink);
      color: #fff;
      border-radius: 8px;
      padding: 0.55rem 0.95rem;
      font: inherit;
      cursor: pointer;
    }
    .actions button.secondary { background: #fff; color: var(--ink); }
    @media print {
      body { padding: 0; }
      .actions { display: none !important; }
      .sheet { max-width: none; }
    }
    @media (max-width: 560px) {
      .grid { grid-template-columns: 1fr; }
      .top { flex-direction: column; }
      .meta { text-align: right; }
    }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="actions">
      <button type="button" onclick="window.print()">طباعة الطلب</button>
      <button type="button" class="secondary" onclick="window.close()">إغلاق</button>
    </div>

    <div class="top">
      <div class="brand-block">
        <img class="logo" src="${logo}" alt="${escapeHtml(BRAND.nameAr)}" width="72" height="72">
        <div class="brand">
          ${escapeHtml(BRAND.nameAr)}
          <span>طلب من الموقع</span>
        </div>
      </div>
      <div class="meta">
        <strong>${escapeHtml(invoice)}</strong>
        <div>${escapeHtml(when)}</div>
        <div>الحالة: ${escapeHtml(statusLabel(order?.status))}</div>
      </div>
    </div>

    <div class="grid">
      <div class="card">
        <h2>العميل</h2>
        <p><strong>${escapeHtml(order?.customer_name || '—')}</strong></p>
        <p><span class="label">الهاتف</span> ${escapeHtml(order?.customer_phone || '—')}</p>
        <p><span class="label">البريد</span> ${escapeHtml(order?.customer_email || '—')}</p>
      </div>
      <div class="card">
        <h2>التوصيل</h2>
        <p>${escapeHtml(address)}</p>
        <p style="margin-top:0.75rem;"><span class="label">الدفع</span> ${escapeHtml(paymentLabel(order?.payment_method))}</p>
        <p><span class="label">حالة الدفع</span> ${escapeHtml(statusLabel(order?.payment_status || order?.status))}</p>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>المنتج</th>
          <th class="num">الكمية</th>
          <th class="num">السعر</th>
          <th class="num">الإجمالي</th>
        </tr>
      </thead>
      <tbody>
        ${rows || '<tr><td colspan="4">لا توجد أصناف.</td></tr>'}
      </tbody>
    </table>

    <div class="totals">
      <div class="row"><span>المجموع الفرعي</span><span>${escapeHtml(formatLyd(subtotal))}</span></div>
      <div class="row"><span>الشحن</span><span>${escapeHtml(formatLyd(shipping))}</span></div>
      <div class="row grand"><span>الإجمالي</span><span>${escapeHtml(formatLyd(total))}</span></div>
    </div>

    <div class="footer">
      <div>شمعدان · بنغازي، شارع البندقية، تقاطع ماي هوم</div>
      <div>هاتف 091-0229971 · info@shamaadan.ly</div>
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
 * Open a printable window for a website order.
 * @param {object} order
 * @param {object[]} [items]
 */
export function printWebsiteOrder(order, items = []) {
  const html = buildWebsiteOrderPrintHtml(order, items);
  const win = window.open('', 'shamaadan-web-order', 'width=820,height=960');
  if (!win) {
    window.alert('اسمح بالنوافذ المنبثقة لطباعة الطلب.');
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  try {
    win.focus();
  } catch {
    /* ignore */
  }
}
