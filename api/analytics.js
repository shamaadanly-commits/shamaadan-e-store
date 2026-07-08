/**
 * Analytics API — returns ledger metrics and recent transactions.
 */
import { createMockTransactions } from '../js/shared/mock-transactions.js';

function summarizeLines(lines) {
  let grossRevenue = 0;
  let assetCost = 0;
  for (const line of lines) {
    grossRevenue += line.unitPrice * line.quantity;
    assetCost += line.unit_cost_at_sale * line.quantity;
  }
  return { grossRevenue, assetCost, netProfit: grossRevenue - assetCost };
}

function buildTransaction(tx) {
  const totals = summarizeLines(tx.lines);
  return { ...tx, ...totals };
}

export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const transactions = createMockTransactions().map(buildTransaction);

  const ledgers = {
    online: aggregate(transactions.filter((t) => t.channel === 'online')),
    pos: aggregate(transactions.filter((t) => t.channel === 'pos')),
  };

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    ok: true,
    currency: 'LYD',
    ledgers,
    transactions: transactions.slice(0, 20),
    timestamp: new Date().toISOString(),
  });
}

function aggregate(list) {
  return list.reduce(
    (acc, tx) => ({
      sellNumber: acc.sellNumber + 1,
      grossRevenue: acc.grossRevenue + tx.grossRevenue,
      assetCost: acc.assetCost + tx.assetCost,
      netProfit: acc.netProfit + tx.netProfit,
    }),
    { sellNumber: 0, grossRevenue: 0, assetCost: 0, netProfit: 0 },
  );
}
