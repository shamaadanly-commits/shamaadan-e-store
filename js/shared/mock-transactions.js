/**
 * Simulated transaction stream for dashboard analytics scaffolding.
 * Each line item carries unit_cost_at_sale — the supplier cost locked at checkout.
 */

/** @typedef {'online' | 'pos'} SalesChannel */

/**
 * @typedef {object} TransactionLine
 * @property {string} productId
 * @property {string} title
 * @property {number} quantity
 * @property {number} unitPrice
 * @property {number} unit_cost_at_sale
 */

/**
 * @typedef {object} Transaction
 * @property {string} id
 * @property {SalesChannel} channel
 * @property {string} timestamp
 * @property {TransactionLine[]} lines
 * @property {string} [paymentMethod]
 * @property {string} [orderRef]
 */

/** @returns {Transaction[]} */
export function createMockTransactions() {
  const ts = (daysAgo, hour = 12) => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    d.setHours(hour, 0, 0, 0);
    return d.toISOString();
  };

  return [
    {
      id: 'tx-on-001',
      channel: 'online',
      timestamp: ts(2, 14),
      paymentMethod: 'upay',
      orderRef: 'SHM-MOCK-001',
      lines: [
        { productId: 'p1', title: 'Oud Noir Candle', quantity: 2, unitPrice: 48, unit_cost_at_sale: 18 },
        { productId: 'p3', title: 'Rose Taif Incense', quantity: 1, unitPrice: 34, unit_cost_at_sale: 11 },
      ],
    },
    {
      id: 'tx-on-002',
      channel: 'online',
      timestamp: ts(1, 9),
      paymentMethod: 'cad',
      orderRef: 'SHM-MOCK-002',
      lines: [
        { productId: 'p5', title: 'Gift Set — Classic', quantity: 1, unitPrice: 120, unit_cost_at_sale: 52 },
      ],
    },
    {
      id: 'tx-on-003',
      channel: 'online',
      timestamp: ts(0, 11),
      paymentMethod: 'upay',
      orderRef: 'SHM-MOCK-003',
      lines: [
        { productId: 'p8', title: 'Musk Oil 12ml', quantity: 1, unitPrice: 72, unit_cost_at_sale: 28 },
        { productId: 'p6', title: 'Bakhoor Mini Pack', quantity: 2, unitPrice: 28, unit_cost_at_sale: 9 },
      ],
    },
    {
      id: 'tx-pos-001',
      channel: 'pos',
      timestamp: ts(2, 16),
      paymentMethod: 'cash',
      lines: [
        { productId: 'p2', title: 'Amber Musk Diffuser', quantity: 1, unitPrice: 62, unit_cost_at_sale: 22 },
        { productId: 'p4', title: 'Sandalwood Room Spray', quantity: 1, unitPrice: 38, unit_cost_at_sale: 14 },
      ],
    },
    {
      id: 'tx-pos-002',
      channel: 'pos',
      timestamp: ts(1, 17),
      paymentMethod: 'terminal',
      lines: [
        { productId: 'p7', title: 'Ceramic Burner', quantity: 1, unitPrice: 55, unit_cost_at_sale: 20 },
      ],
    },
    {
      id: 'tx-pos-003',
      channel: 'pos',
      timestamp: ts(0, 15),
      paymentMethod: 'cash',
      lines: [
        { productId: 'p1', title: 'Oud Noir Candle', quantity: 1, unitPrice: 48, unit_cost_at_sale: 18 },
        { productId: 'p3', title: 'Rose Taif Incense', quantity: 3, unitPrice: 34, unit_cost_at_sale: 11 },
      ],
    },
  ];
}
