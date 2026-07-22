/**
 * Loyverse-style Inventory Valuation — stock × cost / retail summary.
 */
import { formatLyd } from '../shared/format.js';
import { isLiveDbId } from '../shared/ids.js';

function formatMoney(amount) {
  return formatLyd(amount).replace('LYD', 'LD');
}

function formatPct(value) {
  const n = Number(value) || 0;
  return `${n.toFixed(2).replace('.', ',')}%`;
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

/**
 * @param {object[]} products
 * @param {{ category?: string }} [filters]
 */
export function buildInventoryValuation(products, filters = {}) {
  const category = String(filters.category || 'All').trim() || 'All';

  const rows = (products || [])
    .filter((p) => isLiveDbId(p.id))
    .filter((p) => category === 'All' || String(p.category || '') === category)
    .map((p) => {
      const stock = Math.max(0, Number(p.stockQuantity ?? p.stock ?? 0) || 0);
      const cost = Number(p.costPrice ?? p.cost ?? 0) || 0;
      const retail = Number(p.retailPrice ?? p.price ?? 0) || 0;
      const inventoryValue = stock * cost;
      const retailValue = stock * retail;
      const potentialProfit = retailValue - inventoryValue;
      const margin = retailValue > 0 ? (potentialProfit / retailValue) * 100 : 0;

      return {
        id: String(p.id),
        name: String(p.title || p.name || 'Untitled'),
        category: String(p.category || '—'),
        stock,
        cost,
        inventoryValue,
        retailValue,
        potentialProfit,
        margin,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

  const totals = rows.reduce(
    (acc, row) => {
      acc.inventoryValue += row.inventoryValue;
      acc.retailValue += row.retailValue;
      acc.potentialProfit += row.potentialProfit;
      acc.stockUnits += row.stock;
      return acc;
    },
    { inventoryValue: 0, retailValue: 0, potentialProfit: 0, stockUnits: 0 },
  );

  totals.margin = totals.retailValue > 0
    ? (totals.potentialProfit / totals.retailValue) * 100
    : 0;

  const categories = [...new Set(
    (products || [])
      .filter((p) => isLiveDbId(p.id) && p.category)
      .map((p) => String(p.category)),
  )].sort((a, b) => a.localeCompare(b));

  return { rows, totals, categories, category };
}

/**
 * @param {ReturnType<typeof buildInventoryValuation>} valuation
 * @param {{ asOf?: string }} [opts]
 */
export function inventoryValuationHtml(valuation, opts = {}) {
  const asOf = opts.asOf || new Date().toISOString().slice(0, 10);
  const { rows, totals, categories, category } = valuation;

  const categoryOptions = [
    `<option value="All"${category === 'All' ? ' selected' : ''}>All categories</option>`,
    ...categories.map((c) => `
      <option value="${escapeAttr(c)}"${c === category ? ' selected' : ''}>${escapeHtml(c)}</option>
    `),
  ].join('');

  const tableRows = rows.length
    ? rows.map((r) => `
      <tr>
        <td>
          <span class="dash-table__title">${escapeHtml(r.name)}</span>
          <span class="dash-table__sub">${escapeHtml(r.category)}</span>
        </td>
        <td class="dash-table__num">${r.stock}</td>
        <td class="dash-table__num">${formatMoney(r.cost)}</td>
        <td class="dash-table__num">${formatMoney(r.inventoryValue)}</td>
        <td class="dash-table__num">${formatMoney(r.retailValue)}</td>
        <td class="dash-table__num">${formatMoney(r.potentialProfit)}</td>
        <td class="dash-table__num">${formatPct(r.margin)}</td>
      </tr>
    `).join('')
    : `<tr><td colspan="7" class="dash-empty">No products in inventory for this filter.</td></tr>`;

  return `
    <div class="rpt" data-valuation-root>
      <div class="rpt-toolbar">
        <div class="rpt-toolbar__dates">
          <label class="rpt-toolbar__range">
            <span class="rpt-toolbar__label">As of</span>
            <input type="date" data-val-asof value="${escapeAttr(asOf)}" aria-label="Valuation date">
          </label>
          <label class="rpt-chip rpt-chip--select">
            <select data-val-category aria-label="Filter by category">
              ${categoryOptions}
            </select>
          </label>
        </div>
      </div>

      <article class="rpt-card">
        <div class="rpt-kpis rpt-kpis--4">
          <div class="rpt-kpi is-active" role="group">
            <span class="rpt-kpi__label">Total inventory value</span>
            <span class="rpt-kpi__value">${formatMoney(totals.inventoryValue)}</span>
            <span class="rpt-kpi__hint">${totals.stockUnits} unit${totals.stockUnits === 1 ? '' : 's'}</span>
          </div>
          <div class="rpt-kpi" role="group">
            <span class="rpt-kpi__label">Total retail value</span>
            <span class="rpt-kpi__value">${formatMoney(totals.retailValue)}</span>
          </div>
          <div class="rpt-kpi" role="group">
            <span class="rpt-kpi__label">Potential profit</span>
            <span class="rpt-kpi__value">${formatMoney(totals.potentialProfit)}</span>
          </div>
          <div class="rpt-kpi" role="group">
            <span class="rpt-kpi__label">Margin</span>
            <span class="rpt-kpi__value">${formatPct(totals.margin)}</span>
          </div>
        </div>
      </article>

      <article class="rpt-card">
        <header class="rpt-card__header">
          <button type="button" class="rpt-export" data-val-export>EXPORT</button>
          <span class="dash-panel__count">${rows.length} item${rows.length === 1 ? '' : 's'}</span>
        </header>
        <div class="dash-table-wrap">
          <table class="dash-table rpt-table">
            <thead>
              <tr>
                <th scope="col">Item</th>
                <th scope="col">In stock</th>
                <th scope="col">Cost</th>
                <th scope="col">Inventory value</th>
                <th scope="col">Retail value</th>
                <th scope="col">Potential profit</th>
                <th scope="col">Margin</th>
              </tr>
            </thead>
            <tbody>${tableRows}</tbody>
          </table>
        </div>
      </article>
    </div>
  `;
}

/**
 * @param {ReturnType<typeof buildInventoryValuation>} valuation
 * @param {string} [asOf]
 */
export function downloadInventoryValuationCsv(valuation, asOf = '') {
  const header = [
    'Item',
    'Category',
    'In stock',
    'Cost',
    'Inventory value',
    'Retail value',
    'Potential profit',
    'Margin %',
  ];
  const lines = [header.join(',')];
  for (const r of valuation.rows || []) {
    lines.push([
      csvCell(r.name),
      csvCell(r.category),
      r.stock,
      r.cost.toFixed(2),
      r.inventoryValue.toFixed(2),
      r.retailValue.toFixed(2),
      r.potentialProfit.toFixed(2),
      r.margin.toFixed(2),
    ].join(','));
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `shamaadan-inventory-valuation${asOf ? `-${asOf}` : ''}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function csvCell(value) {
  const s = String(value ?? '');
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
