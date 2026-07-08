/**
 * Financial dashboard — tracks Online vs In-Store metrics.
 */
import { formatCurrency, formatCount } from '../shared/format.js';

const METRIC_KEYS = ['sellCount', 'grossRevenue', 'productCost', 'netProfit'];

/**
 * @typedef {object} ChannelMetrics
 * @property {number} sellCount
 * @property {number} grossRevenue
 * @property {number} productCost
 * @property {number} netProfit
 */

export function createDashboard() {
  /** @type {{ online: ChannelMetrics, inStore: ChannelMetrics }} */
  const state = {
    online: emptyMetrics(),
    inStore: emptyMetrics(),
  };

  const listeners = new Set();

  function emptyMetrics() {
    return { sellCount: 0, grossRevenue: 0, productCost: 0, netProfit: 0 };
  }

  function notify() {
    listeners.forEach((fn) => fn({ ...state }));
  }

  /**
   * Record a completed sale for a channel.
   * @param {'online' | 'inStore'} channel
   * @param {{ revenue: number, cost: number, profit: number, units: number }} sale
   */
  function recordSale(channel, sale) {
    const metrics = state[channel];
    metrics.sellCount += sale.units;
    metrics.grossRevenue += sale.revenue;
    metrics.productCost += sale.cost;
    metrics.netProfit += sale.profit;
    notify();
  }

  function subscribe(fn) {
    listeners.add(fn);
    fn({ ...state });
    return () => listeners.delete(fn);
  }

  return { recordSale, subscribe, getState: () => ({ ...state }) };
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
    { key: 'sellCount', label: 'Sell Count', format: formatCount },
    { key: 'grossRevenue', label: 'Gross Revenue', format: formatCurrency },
    { key: 'productCost', label: 'Product Cost', format: formatCurrency, className: 'pos__metric-value--cost' },
    { key: 'netProfit', label: 'Net Profit', format: formatCurrency, className: 'pos__metric-value--profit' },
  ];

  return `
    <div class="pos__metrics">
      ${rows.map((row) => `
        <div class="pos__metric">
          <p class="pos__metric-label">${row.label}</p>
          <p class="pos__metric-value ${row.className ?? ''}">${row.format(metrics[row.key])}</p>
        </div>
      `).join('')}
    </div>
  `;
}
