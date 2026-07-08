/**
 * Mock catalog for scaffolding. Replace with Supabase queries in production.
 */
export const MOCK_PRODUCTS = [
  { id: 'p1', sku: 'SHM-001', name: 'Oud Noir Candle', category: 'Candles', price: 48, cost: 18, stock: 24, image: null },
  { id: 'p2', sku: 'SHM-002', name: 'Amber Musk Diffuser', category: 'Diffusers', price: 62, cost: 22, stock: 18, image: null },
  { id: 'p3', sku: 'SHM-003', name: 'Rose Taif Incense', category: 'Incense', price: 34, cost: 11, stock: 42, image: null },
  { id: 'p4', sku: 'SHM-004', name: 'Sandalwood Room Spray', category: 'Sprays', price: 38, cost: 14, stock: 15, image: null },
  { id: 'p5', sku: 'SHM-005', name: 'Gift Set — Classic', category: 'Sets', price: 120, cost: 52, stock: 9, image: null },
  { id: 'p6', sku: 'SHM-006', name: 'Bakhoor Mini Pack', category: 'Bakhoor', price: 28, cost: 9, stock: 31, image: null },
  { id: 'p7', sku: 'SHM-007', name: 'Ceramic Burner', category: 'Accessories', price: 55, cost: 20, stock: 12, image: null },
  { id: 'p8', sku: 'SHM-008', name: 'Musk Oil 12ml', category: 'Oils', price: 72, cost: 28, stock: 20, image: null },
];

export function cloneCatalog(products = MOCK_PRODUCTS) {
  return products.map((p) => ({ ...p }));
}
