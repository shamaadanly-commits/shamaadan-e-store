/**
 * Inventory API — product CRUD scaffold for Central Dashboard.
 * Persists to Supabase when service role is configured; otherwise returns mock payload.
 */
import { createClient } from '@supabase/supabase-js';
import { MOCK_PRODUCTS } from '../js/shared/mock-products.js';

function normalizeRow(row) {
  return {
    id: row.id,
    title: row.title ?? row.name,
    collectionName: row.collection_name ?? row.category ?? 'General',
    costPrice: Number(row.cost_price ?? row.cost ?? 0),
    retailPrice: Number(row.retail_price ?? row.price ?? 0),
    stockQuantity: Number(row.stock_quantity ?? row.stock ?? 0),
    barcode: row.barcode ?? row.sku ?? '',
    imageUrls: row.image_urls ?? (row.image ? [row.image] : []),
  };
}

function toDbRow(product) {
  return {
    id: product.id,
    name: product.title,
    category: product.collectionName,
    cost: product.costPrice,
    price: product.retailPrice,
    stock: product.stockQuantity,
    barcode: product.barcode,
    sku: product.barcode,
    image_urls: product.imageUrls,
    active: true,
  };
}

function getSupabase() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export default async function handler(req, res) {
  const supabase = getSupabase();

  if (req.method === 'GET') {
    if (supabase) {
      const { data, error } = await supabase.from('products').select('*').eq('active', true);
      if (!error && data?.length) {
        return res.status(200).json({ ok: true, products: data.map(normalizeRow) });
      }
    }
    return res.status(200).json({
      ok: true,
      products: MOCK_PRODUCTS.map(normalizeRow),
      source: 'mock',
    });
  }

  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const product = normalizeRow(body);

    if (!product.title || !product.barcode) {
      return res.status(400).json({ ok: false, error: 'title and barcode are required' });
    }

    if (supabase) {
      const { data, error } = await supabase
        .from('products')
        .upsert(toDbRow(product))
        .select()
        .single();
      if (error) return res.status(500).json({ ok: false, error: error.message });
      return res.status(200).json({ ok: true, product: normalizeRow(data) });
    }

    return res.status(200).json({ ok: true, product, source: 'mock' });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ ok: false, error: 'Method not allowed' });
}
