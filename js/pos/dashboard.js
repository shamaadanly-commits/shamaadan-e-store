/**
 * POS mini-dashboard — reads from Central Dashboard shared state.
 */
import { formatLyd, formatCount } from '../shared/format.js';

const METRIC_KEYS = ['sellNumber', 'grossRevenue', 'assetCost', 'netProfit'];

/**
 * @typedef {object} ChannelMetrics
 * @property {number} sellNumber
 * @property {number} grossRevenue
 * @property {number} assetCost
 * @property {number} netProfit
 */

/**
 * @param {ReturnType<import('../dashboard.js').getSharedDashboardState>} [centralState]
 */
export function createDashboard(centralState) {
  const state = centralState ?? null;
  const listeners = new Set();

  function getMetrics() {
    if (state) {
      const { ledgers } = state.getSnapshot();
      return {
        online: mapLedger(ledgers.online),
        inStore: mapLedger(ledgers.pos),
      };
    }
    return { online: emptyMetrics(), inStore: emptyMetrics() };
  }

  function mapLedger(ledger) {
    return {
      sellNumber: ledger.sellNumber,
      grossRevenue: ledger.grossRevenue,
      productCost: ledger.assetCost,
      netProfit: ledger.netProfit,
    };
  }

  function emptyMetrics() {
    return { sellNumber: 0, grossRevenue: 0, productCost: 0, netProfit: 0 };
  }

  function notify() {
    listeners.forEach((fn) => fn(getMetrics()));
  }

  function subscribe(fn) {
    listeners.add(fn);
    fn(getMetrics());
    if (state) {
      state.subscribe(() => fn(getMetrics()));
    }
    return () => listeners.delete(fn);
  }

  function refresh() {
    notify();
  }

  return { subscribe, refresh, getState: getMetrics };
}

/**
 * Render dashboard HTML into a container.
 * @param {HTMLElement} container
 * @param {{ online: ChannelMetrics, inStore: ChannelMetrics }} data
 */
export function renderDashboard(container, data) {
  container.innerHTML = `
    <div class="pos__dashboard-panel" data-channel="inStore">
      <h3>In-Store (POS)</h3>
      ${metricsGrid(data.inStore)}
    </div>
    <div class="pos__dashboard-panel" data-channel="online">
      <h3>Online</h3>
      ${metricsGrid(data.online)}
    </div>
  `;
}

function metricsGrid(metrics) {
  const rows = [
    { key: 'sellNumber', label: 'Sell Number', format: formatCount },
    { key: 'grossRevenue', label: 'Gross Revenue', format: formatLyd },
    { key: 'productCost', label: 'Asset Cost', format: formatLyd, className: 'pos__metric-value--cost' },
    { key: 'netProfit', label: 'Net Profit', format: formatLyd, className: 'pos__metric-value--profit' },
  ];

  return `
    <div class="pos__metrics">
      ${rows.map((row) => `
        <div class="pos__metric">
          <p class="pos__metric-label">${row.label}</p>
          <p class="pos__metric-value ${row.className ?? ''}">${row.format(metrics[row.key] ?? 0)}</p>
        </div>
      `).join('')}
    </div>
  `;
}
