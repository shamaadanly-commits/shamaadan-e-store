/**
 * Loyverse-style Sales summary report — KPIs, SVG chart, daily table, CSV export.
 */
import { formatLyd } from '../shared/format.js';

/**
 * @param {Date} d
 * @returns {string} YYYY-MM-DD
 */
export function toDateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Default report window: last 30 days inclusive ending today.
 */
export function defaultReportRange() {
  const to = new Date();
  to.setHours(0, 0, 0, 0);
  const from = new Date(to);
  from.setDate(from.getDate() - 29);
  return { from: toDateKey(from), to: toDateKey(to) };
}

/**
 * Shift a date range by the same number of days (prev / next period).
 * @param {{ from: string, to: string }} range
 * @param {number} direction -1 | 1
 */
export function shiftReportRange(range, direction) {
  const from = parseLocalDate(range.from);
  const to = parseLocalDate(range.to);
  const days = Math.round((to - from) / 86400000) + 1;
  const delta = days * direction;
  from.setDate(from.getDate() + delta);
  to.setDate(to.getDate() + delta);
  return { from: toDateKey(from), to: toDateKey(to) };
}

function parseLocalDate(key) {
  const [y, m, d] = String(key).split('-').map(Number);
  return new Date(y, m - 1, d);
}

function orderDayKey(order) {
  const raw = order.completed_at || order.created_at || order.updated_at;
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return toDateKey(d);
}

function orderCost(order) {
  const items = order.order_items || [];
  return items.reduce((sum, line) => {
    const qty = Math.abs(Number(line.quantity) || 0);
    const cost = Number(line.wholesale_cost) || 0;
    return sum + qty * cost;
  }, 0);
}

/**
 * Build daily buckets + totals for the Sales summary.
 * @param {object[]} orders
 * @param {{ from: string, to: string }} range
 * @param {{ from: string, to: string }} [compareRange]
 */
export function buildSalesSummary(orders, range, compareRange = null) {
  const days = [];
  const cursor = parseLocalDate(range.from);
  const end = parseLocalDate(range.to);
  while (cursor <= end) {
    const key = toDateKey(cursor);
    days.push({
      date: key,
      label: formatDayLabel(cursor),
      grossSales: 0,
      refunds: 0,
      discounts: 0,
      netSales: 0,
      costOfGoods: 0,
      grossProfit: 0,
      receiptCount: 0,
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  const byDate = new Map(days.map((d) => [d.date, d]));

  for (const order of orders || []) {
    const key = orderDayKey(order);
    if (!key || !byDate.has(key)) continue;
    const bucket = byDate.get(key);
    const amount = Math.abs(Number(order.total_amount) || 0);
    const status = String(order.status || '').toLowerCase();
    const cost = orderCost(order);

    if (status === 'refunded' || status === 'cancelled') {
      bucket.refunds += amount;
      continue;
    }

    // Count completed / paid / pending paid as sales
    if (!['completed', 'paid', 'pending'].includes(status) && status !== 'open' && status !== 'parked') {
      // still include unknown statuses with positive totals as sales
      if (!(amount > 0)) continue;
    }
    if (status === 'open' || status === 'parked') continue;

    bucket.grossSales += amount;
    bucket.costOfGoods += cost;
    bucket.receiptCount += 1;
  }

  for (const day of days) {
    day.netSales = Math.max(0, day.grossSales - day.refunds - day.discounts);
    day.grossProfit = day.netSales - day.costOfGoods;
  }

  const totals = days.reduce(
    (acc, day) => {
      acc.grossSales += day.grossSales;
      acc.refunds += day.refunds;
      acc.discounts += day.discounts;
      acc.netSales += day.netSales;
      acc.costOfGoods += day.costOfGoods;
      acc.grossProfit += day.grossProfit;
      acc.receiptCount += day.receiptCount;
      return acc;
    },
    {
      grossSales: 0,
      refunds: 0,
      discounts: 0,
      netSales: 0,
      costOfGoods: 0,
      grossProfit: 0,
      receiptCount: 0,
    },
  );

  let compare = null;
  if (compareRange && Array.isArray(orders)) {
    // Caller should pass previous-period orders separately; optional stub.
    compare = null;
  }

  return { days, totals, range, compare };
}

function formatDayLabel(d) {
  return d.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' });
}

/**
 * Format range for the toolbar: "Jun 23, 2026 - Jul 22, 2026"
 */
export function formatRangeLabel(range) {
  const from = parseLocalDate(range.from);
  const to = parseLocalDate(range.to);
  const opts = { month: 'short', day: 'numeric', year: 'numeric' };
  return `${from.toLocaleDateString('en-US', opts)} - ${to.toLocaleDateString('en-US', opts)}`;
}

/**
 * Format money like Loyverse sample: "42.634,40 LD" style via Intl LYD.
 */
export function formatReportMoney(amount) {
  return formatLyd(amount).replace('LYD', 'LD');
}

/**
 * @param {ReturnType<typeof buildSalesSummary>} summary
 * @param {'grossSales'|'refunds'|'discounts'|'netSales'|'grossProfit'} metric
 */
export function salesChartSvg(summary, metric = 'grossSales') {
  const days = summary.days || [];
  const width = 920;
  const height = 280;
  const pad = { top: 24, right: 16, bottom: 36, left: 64 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  const values = days.map((d) => Number(d[metric]) || 0);
  const maxVal = Math.max(...values, 1);
  const n = Math.max(days.length - 1, 1);

  const points = days.map((d, i) => {
    const x = pad.left + (i / n) * innerW;
    const y = pad.top + innerH - (values[i] / maxVal) * innerH;
    return { x, y, value: values[i], label: d.label };
  });

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const area = points.length
    ? `${line} L${points[points.length - 1].x.toFixed(1)} ${(pad.top + innerH).toFixed(1)} L${points[0].x.toFixed(1)} ${(pad.top + innerH).toFixed(1)} Z`
    : '';

  const yTicks = 4;
  const grid = Array.from({ length: yTicks + 1 }, (_, i) => {
    const t = i / yTicks;
    const y = pad.top + innerH * (1 - t);
    const val = maxVal * t;
    return `
      <line x1="${pad.left}" y1="${y.toFixed(1)}" x2="${width - pad.right}" y2="${y.toFixed(1)}" class="rpt-chart__grid"/>
      <text x="${pad.left - 8}" y="${(y + 4).toFixed(1)}" text-anchor="end" class="rpt-chart__axis">${escapeHtml(formatAxisMoney(val))}</text>
    `;
  }).join('');

  const xLabels = points
    .filter((_, i) => i === 0 || i === points.length - 1 || i % Math.ceil(points.length / 6) === 0)
    .map((p) => `<text x="${p.x.toFixed(1)}" y="${height - 10}" text-anchor="middle" class="rpt-chart__axis">${escapeHtml(p.label)}</text>`)
    .join('');

  const dots = points
    .map((p) => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.5" class="rpt-chart__dot"/>`)
    .join('');

  return `
    <svg class="rpt-chart__svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Sales chart">
      ${grid}
      <path d="${area}" class="rpt-chart__area"/>
      <path d="${line}" class="rpt-chart__line" fill="none"/>
      ${dots}
      ${xLabels}
    </svg>
  `;
}

function formatAxisMoney(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return String(Math.round(n));
}

const KPI_DEFS = [
  { key: 'grossSales', label: 'Gross sales' },
  { key: 'refunds', label: 'Refunds' },
  { key: 'discounts', label: 'Discounts' },
  { key: 'netSales', label: 'Net sales' },
  { key: 'grossProfit', label: 'Gross profit' },
];

/**
 * Full Sales summary page markup.
 * @param {ReturnType<typeof buildSalesSummary>} summary
 * @param {{ metric?: string, loading?: boolean, error?: string }} [opts]
 */
export function salesSummaryHtml(summary, opts = {}) {
  const metric = opts.metric || 'grossSales';
  const rangeLabel = formatRangeLabel(summary.range);
  const totals = summary.totals;

  if (opts.loading) {
    return `<div class="rpt"><p class="dash-empty">Loading sales summary…</p></div>`;
  }
  if (opts.error) {
    return `<div class="rpt"><p class="dash-empty">${escapeHtml(opts.error)}</p></div>`;
  }

  const kpis = KPI_DEFS.map((k) => `
    <button type="button" class="rpt-kpi${metric === k.key ? ' is-active' : ''}" data-rpt-metric="${k.key}">
      <span class="rpt-kpi__label">${k.label}</span>
      <span class="rpt-kpi__value">${formatReportMoney(totals[k.key] || 0)}</span>
      <span class="rpt-kpi__hint">${totals.receiptCount} receipt${totals.receiptCount === 1 ? '' : 's'}</span>
    </button>
  `).join('');

  const metricLabel = KPI_DEFS.find((k) => k.key === metric)?.label || 'Gross sales';

  const rows = (summary.days || []).map((d) => `
    <tr>
      <td>${escapeHtml(d.label)}</td>
      <td class="dash-table__num">${formatReportMoney(d.grossSales)}</td>
      <td class="dash-table__num">${formatReportMoney(d.refunds)}</td>
      <td class="dash-table__num">${formatReportMoney(d.discounts)}</td>
      <td class="dash-table__num">${formatReportMoney(d.netSales)}</td>
      <td class="dash-table__num">${formatReportMoney(d.costOfGoods)}</td>
      <td class="dash-table__num">${formatReportMoney(d.grossProfit)}</td>
    </tr>
  `).join('');

  return `
    <div class="rpt" data-reports-root>
      <div class="rpt-toolbar">
        <div class="rpt-toolbar__dates">
          <button type="button" class="rpt-toolbar__nav" data-rpt-shift="-1" aria-label="Previous period">‹</button>
          <label class="rpt-toolbar__range">
            <input type="date" data-rpt-from value="${escapeAttr(summary.range.from)}" aria-label="From date">
            <span aria-hidden="true">–</span>
            <input type="date" data-rpt-to value="${escapeAttr(summary.range.to)}" aria-label="To date">
          </label>
          <button type="button" class="rpt-toolbar__nav" data-rpt-shift="1" aria-label="Next period">›</button>
          <span class="rpt-toolbar__label">${escapeHtml(rangeLabel)}</span>
        </div>
        <div class="rpt-toolbar__filters">
          <span class="rpt-chip">All day</span>
          <span class="rpt-chip">All channels</span>
        </div>
      </div>

      <article class="rpt-card">
        <div class="rpt-kpis" role="tablist" aria-label="Sales metrics">
          ${kpis}
        </div>
      </article>

      <article class="rpt-card rpt-card--chart">
        <header class="rpt-card__header">
          <h2 class="rpt-card__title">${escapeHtml(metricLabel)}</h2>
          <div class="rpt-card__controls">
            <span class="rpt-chip">Area</span>
            <span class="rpt-chip">Days</span>
          </div>
        </header>
        <div class="rpt-chart" data-rpt-chart>
          ${salesChartSvg(summary, metric)}
        </div>
      </article>

      <article class="rpt-card">
        <header class="rpt-card__header">
          <button type="button" class="rpt-export" data-rpt-export>EXPORT</button>
        </header>
        <div class="dash-table-wrap">
          <table class="dash-table rpt-table">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Gross sales</th>
                <th scope="col">Refunds</th>
                <th scope="col">Discounts</th>
                <th scope="col">Net sales</th>
                <th scope="col">Cost of goods</th>
                <th scope="col">Gross profit</th>
              </tr>
            </thead>
            <tbody>
              ${rows || '<tr><td colspan="7" class="dash-empty">No sales in this period.</td></tr>'}
            </tbody>
          </table>
        </div>
      </article>
    </div>
  `;
}

/**
 * @param {ReturnType<typeof buildSalesSummary>} summary
 */
export function downloadSalesCsv(summary) {
  const header = ['Date', 'Gross sales', 'Refunds', 'Discounts', 'Net sales', 'Cost of goods', 'Gross profit'];
  const lines = [header.join(',')];
  for (const d of summary.days || []) {
    lines.push([
      d.date,
      d.grossSales.toFixed(2),
      d.refunds.toFixed(2),
      d.discounts.toFixed(2),
      d.netSales.toFixed(2),
      d.costOfGoods.toFixed(2),
      d.grossProfit.toFixed(2),
    ].join(','));
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `shamaadan-sales-${summary.range.from}_${summary.range.to}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const ITEM_COLORS = ['#4caf50', '#2196f3', '#ff9800', '#e91e63', '#9c27b0', '#00bcd4', '#795548'];

/**
 * Aggregate sales by item (POS + online) for the Sales by item report.
 * @param {object[]} orders
 * @param {{ from: string, to: string }} range
 * @param {Map<string, { category?: string, title?: string }> | Record<string, object>} [productIndex]
 */
export function buildSalesByItem(orders, range, productIndex = {}) {
  const lookup = productIndex instanceof Map
    ? productIndex
    : new Map(Object.entries(productIndex || {}));

  /** @type {Map<string, object>} */
  const byItem = new Map();
  /** @type {Map<string, Map<string, number>>} */
  const dailyByItem = new Map();

  const dayKeys = [];
  const cursor = parseLocalDate(range.from);
  const end = parseLocalDate(range.to);
  while (cursor <= end) {
    dayKeys.push(toDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  for (const order of orders || []) {
    const status = String(order.status || '').toLowerCase();
    if (status === 'refunded' || status === 'cancelled' || status === 'open' || status === 'parked') continue;

    const day = orderDayKey(order);
    if (!day || day < range.from || day > range.to) continue;

    for (const line of order.order_items || []) {
      const qty = Math.abs(Number(line.quantity) || 0);
      if (!qty) continue;
      const unit = Number(line.unit_price) || 0;
      const cost = Number(line.wholesale_cost) || 0;
      const net = qty * unit;
      const cogs = qty * cost;
      const productId = line.product_id ? String(line.product_id) : '';
      const product = productId ? lookup.get(productId) : null;
      const name = String(
        line.product_name
        || product?.title
        || product?.name
        || 'Untitled',
      ).trim() || 'Untitled';
      const key = productId || `name:${name.toLowerCase()}`;
      const category = String(
        product?.category
        || product?.collectionName
        || '—',
      );

      if (!byItem.has(key)) {
        byItem.set(key, {
          key,
          productId,
          name,
          category,
          itemsSold: 0,
          discounts: 0,
          netSales: 0,
          costOfGoods: 0,
          grossProfit: 0,
        });
      }
      const row = byItem.get(key);
      row.itemsSold += qty;
      row.netSales += net;
      row.costOfGoods += cogs;
      row.grossProfit = row.netSales - row.costOfGoods;

      if (!dailyByItem.has(day)) dailyByItem.set(day, new Map());
      const dayMap = dailyByItem.get(day);
      dayMap.set(key, (dayMap.get(key) || 0) + net);
    }
  }

  const items = [...byItem.values()].sort((a, b) => b.netSales - a.netSales);
  const top5 = items.slice(0, 5).map((item, i) => ({
    ...item,
    color: ITEM_COLORS[i % ITEM_COLORS.length],
  }));

  const days = dayKeys.map((date) => {
    const d = parseLocalDate(date);
    const series = {};
    for (const top of top5) {
      series[top.key] = dailyByItem.get(date)?.get(top.key) || 0;
    }
    return { date, label: formatDayLabel(d), series };
  });

  return { range, items, top5, days };
}

/**
 * Stacked bar chart for top items by day.
 * @param {ReturnType<typeof buildSalesByItem>} report
 */
export function salesByItemChartSvg(report) {
  const days = report.days || [];
  const top5 = report.top5 || [];
  const width = 920;
  const height = 280;
  const pad = { top: 24, right: 16, bottom: 36, left: 64 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const n = Math.max(days.length, 1);
  const barW = Math.max(2, Math.min(18, (innerW / n) * 0.65));

  let maxVal = 1;
  for (const day of days) {
    const sum = top5.reduce((s, item) => s + (day.series[item.key] || 0), 0);
    if (sum > maxVal) maxVal = sum;
  }

  const yTicks = 4;
  const grid = Array.from({ length: yTicks + 1 }, (_, i) => {
    const t = i / yTicks;
    const y = pad.top + innerH * (1 - t);
    const val = maxVal * t;
    return `
      <line x1="${pad.left}" y1="${y.toFixed(1)}" x2="${width - pad.right}" y2="${y.toFixed(1)}" class="rpt-chart__grid"/>
      <text x="${pad.left - 8}" y="${(y + 4).toFixed(1)}" text-anchor="end" class="rpt-chart__axis">${escapeHtml(formatAxisMoney(val))}</text>
    `;
  }).join('');

  const bars = days.map((day, i) => {
    const x = pad.left + ((i + 0.5) / n) * innerW - barW / 2;
    let y = pad.top + innerH;
    const stacks = top5.map((item) => {
      const value = day.series[item.key] || 0;
      const h = (value / maxVal) * innerH;
      y -= h;
      if (h <= 0) return '';
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" fill="${item.color}" rx="1"/>`;
    }).join('');
    return stacks;
  }).join('');

  const xLabels = days
    .filter((_, i) => i === 0 || i === days.length - 1 || i % Math.ceil(days.length / 6) === 0)
    .map((day, idx, arr) => {
      const i = days.indexOf(day);
      const x = pad.left + ((i + 0.5) / n) * innerW;
      return `<text x="${x.toFixed(1)}" y="${height - 10}" text-anchor="middle" class="rpt-chart__axis">${escapeHtml(day.label)}</text>`;
    })
    .join('');

  return `
    <svg class="rpt-chart__svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Sales by item chart">
      ${grid}
      ${bars}
      ${xLabels}
    </svg>
  `;
}

/**
 * @param {ReturnType<typeof buildSalesByItem>} report
 * @param {{ loading?: boolean, error?: string }} [opts]
 */
export function salesByItemHtml(report, opts = {}) {
  if (opts.loading) {
    return `<div class="rpt"><p class="dash-empty">Loading sales by item…</p></div>`;
  }
  if (opts.error) {
    return `<div class="rpt"><p class="dash-empty">${escapeHtml(opts.error)}</p></div>`;
  }

  const rangeLabel = formatRangeLabel(report.range);
  const topList = (report.top5 || []).map((item) => `
    <li class="rpt-top__item">
      <span class="rpt-top__dot" style="background:${item.color}"></span>
      <span class="rpt-top__name">${escapeHtml(item.name)}</span>
      <span class="rpt-top__value">${formatReportMoney(item.netSales)}</span>
    </li>
  `).join('') || '<li class="dash-empty">No item sales in this period.</li>';

  const rows = (report.items || []).map((item) => `
    <tr>
      <td>${escapeHtml(item.name)}</td>
      <td>${escapeHtml(item.category)}</td>
      <td class="dash-table__num">${item.itemsSold}</td>
      <td class="dash-table__num">${formatReportMoney(item.discounts)}</td>
      <td class="dash-table__num">${formatReportMoney(item.netSales)}</td>
      <td class="dash-table__num">${formatReportMoney(item.grossProfit)}</td>
    </tr>
  `).join('');

  return `
    <div class="rpt" data-sales-by-item-root>
      <div class="rpt-toolbar">
        <div class="rpt-toolbar__dates">
          <button type="button" class="rpt-toolbar__nav" data-sbi-shift="-1" aria-label="Previous period">‹</button>
          <label class="rpt-toolbar__range">
            <input type="date" data-sbi-from value="${escapeAttr(report.range.from)}" aria-label="From date">
            <span aria-hidden="true">–</span>
            <input type="date" data-sbi-to value="${escapeAttr(report.range.to)}" aria-label="To date">
          </label>
          <button type="button" class="rpt-toolbar__nav" data-sbi-shift="1" aria-label="Next period">›</button>
          <span class="rpt-toolbar__label">${escapeHtml(rangeLabel)}</span>
        </div>
        <div class="rpt-toolbar__filters">
          <span class="rpt-chip">All day</span>
          <span class="rpt-chip">All channels</span>
        </div>
      </div>

      <div class="rpt-split">
        <article class="rpt-card">
          <header class="rpt-card__header">
            <h2 class="rpt-card__title">Top 5 items</h2>
          </header>
          <ol class="rpt-top">
            ${topList}
          </ol>
        </article>
        <article class="rpt-card rpt-card--chart">
          <header class="rpt-card__header">
            <h2 class="rpt-card__title">Sales by item</h2>
            <div class="rpt-card__controls">
              <span class="rpt-chip">Bar</span>
              <span class="rpt-chip">Days</span>
            </div>
          </header>
          <div class="rpt-chart">
            ${salesByItemChartSvg(report)}
          </div>
        </article>
      </div>

      <article class="rpt-card">
        <header class="rpt-card__header">
          <button type="button" class="rpt-export" data-sbi-export>EXPORT</button>
          <span class="dash-panel__count">${(report.items || []).length} item${(report.items || []).length === 1 ? '' : 's'}</span>
        </header>
        <div class="dash-table-wrap">
          <table class="dash-table rpt-table">
            <thead>
              <tr>
                <th scope="col">Item</th>
                <th scope="col">Category</th>
                <th scope="col">Items sold</th>
                <th scope="col">Discounts</th>
                <th scope="col">Net sales</th>
                <th scope="col">Gross profit</th>
              </tr>
            </thead>
            <tbody>
              ${rows || '<tr><td colspan="6" class="dash-empty">No item sales in this period.</td></tr>'}
            </tbody>
          </table>
        </div>
      </article>
    </div>
  `;
}

/**
 * @param {ReturnType<typeof buildSalesByItem>} report
 */
export function downloadSalesByItemCsv(report) {
  const header = ['Item', 'Category', 'Items sold', 'Discounts', 'Net sales', 'Gross profit'];
  const lines = [header.join(',')];
  for (const item of report.items || []) {
    const cell = (v) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    lines.push([
      cell(item.name),
      cell(item.category),
      item.itemsSold,
      item.discounts.toFixed(2),
      item.netSales.toFixed(2),
      item.grossProfit.toFixed(2),
    ].join(','));
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `shamaadan-sales-by-item-${report.range.from}_${report.range.to}.csv`;
  a.click();
  URL.revokeObjectURL(url);
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
