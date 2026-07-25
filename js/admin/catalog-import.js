/**
 * Import Loyverse-style export_items Excel/CSV into the catalog.
 * Creates categories automatically. Never pushes products to the website.
 */
import { upsertProductRow, mapProductFromDb, isSupabaseConfigured } from '../../shared/supabase.js';

const XLSX_CDN = 'https://esm.sh/xlsx@0.18.5';

/** @type {Promise<typeof import('xlsx')> | null} */
let xlsxPromise = null;

function loadXlsx() {
  if (!xlsxPromise) {
    xlsxPromise = import(/* @vite-ignore */ XLSX_CDN).catch((err) => {
      xlsxPromise = null;
      throw new Error(
        `Could not load the Excel reader (${err?.message || err}). Check your internet connection and try again.`,
      );
    });
  }
  return xlsxPromise;
}

/**
 * @param {string} value
 */
function normalizeHeader(value) {
  return String(value ?? '')
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

/**
 * @param {unknown} value
 */
function cellText(value) {
  if (value == null) return '';
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Avoid 10142 becoming 10142.0
    return Number.isInteger(value) ? String(value) : String(value);
  }
  return String(value).trim();
}

/**
 * @param {unknown} value
 * @param {number} [fallback]
 */
function cellNumber(value, fallback = 0) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const cleaned = String(value).replace(/[^0-9.-]/g, '').trim();
  if (!cleaned) return fallback;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * @param {Record<string, unknown>} row
 * @param {(key: string) => boolean} predicate
 */
function findCell(row, predicate) {
  for (const [key, value] of Object.entries(row)) {
    if (predicate(normalizeHeader(key))) return value;
  }
  return undefined;
}

/**
 * @param {Record<string, unknown>} row
 * @param {string[]} exactNames
 */
function getExact(row, exactNames) {
  const wanted = new Set(exactNames.map(normalizeHeader));
  return findCell(row, (key) => wanted.has(key));
}

/**
 * Price may be "Price", "Default price", or "Price [Store]".
 * @param {Record<string, unknown>} row
 */
function getPrice(row) {
  const exact = getExact(row, ['price', 'default price', 'retail price', 'sale price']);
  if (exact != null && cellText(exact) !== '') return cellNumber(exact, 0);

  const storePrice = findCell(row, (key) => key.startsWith('price [') || key.startsWith('price('));
  if (storePrice != null && cellText(storePrice) !== '') return cellNumber(storePrice, 0);

  return 0;
}

/**
 * @param {Record<string, unknown>} row
 */
function getStock(row) {
  const exact = getExact(row, ['in stock', 'stock', 'quantity', 'qty']);
  if (exact != null && cellText(exact) !== '') return Math.max(0, Math.trunc(cellNumber(exact, 0)));

  const storeStock = findCell(row, (key) => key.startsWith('in stock [') || key.startsWith('in stock('));
  if (storeStock != null && cellText(storeStock) !== '') {
    return Math.max(0, Math.trunc(cellNumber(storeStock, 0)));
  }
  return 0;
}

/**
 * @param {Record<string, unknown>} row
 */
function getOptionSpecs(row) {
  const parts = [];
  for (let i = 1; i <= 3; i += 1) {
    const value = cellText(getExact(row, [
      `option ${i} value`,
      `option${i} value`,
      `option ${i}value`,
    ]));
    if (value) parts.push(value);
  }
  return parts.join(' · ');
}

/**
 * @param {Record<string, unknown>} row
 */
function getOptionColor(row) {
  const name = cellText(getExact(row, ['option 1 name', 'option1 name']));
  const value = cellText(getExact(row, ['option 1 value', 'option1 value']));
  if (!value) return '';
  // If option 1 is explicitly color-related, store it in Color; otherwise leave Color empty
  // and keep all values in Specs.
  if (/color|لون|colour/i.test(name)) return value;
  return '';
}

/**
 * @param {File} file
 * @returns {Promise<Record<string, unknown>[]>}
 */
export async function parseCatalogSpreadsheet(file) {
  const name = String(file?.name || '').toLowerCase();
  const isCsv = name.endsWith('.csv') || file.type === 'text/csv';

  if (isCsv) {
    const text = await file.text();
    return parseCsvText(text);
  }

  const XLSX = await loadXlsx();
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', codepage: 65001 });
  const preferred = workbook.SheetNames.find((n) => /export[_\s-]?items/i.test(n))
    || workbook.SheetNames[0];
  if (!preferred) throw new Error('This spreadsheet has no sheets to import.');
  const sheet = workbook.Sheets[preferred];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
  if (!Array.isArray(rows) || !rows.length) {
    throw new Error('No product rows found in the spreadsheet.');
  }
  return rows;
}

/**
 * Minimal CSV parser (handles quoted fields).
 * @param {string} text
 */
function parseCsvText(text) {
  const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) throw new Error('CSV file is empty.');

  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    /** @type {Record<string, string>} */
    const row = {};
    headers.forEach((header, i) => {
      row[header] = cells[i] ?? '';
    });
    return row;
  });
}

/**
 * @param {string} line
 */
function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/**
 * Map spreadsheet rows → product payloads (website push always off).
 * @param {Record<string, unknown>[]} rows
 */
export function mapSpreadsheetRowsToProducts(rows) {
  /** @type {Array<{
   *   title: string,
   *   description: string,
   *   category: string,
   *   collectionName: string,
   *   barcode: string,
   *   retailPrice: number,
   *   costPrice: number,
   *   stockQuantity: number,
   *   minStockAlert: number,
   *   color: string,
   *   scent: string,
   *   showOnWebsite: false,
   *   active: boolean,
   *   handle?: string,
   * }>} */
  const products = [];

  let carryName = '';
  let carryCategory = '';
  let carryDescription = '';
  let carryHandle = '';

  for (const raw of rows) {
    // Skip composite component lines (have included SKU but no item SKU/name of their own).
    const includedSku = cellText(getExact(raw, [
      'sku of included item',
      'sku of included items',
    ]));
    const sku = cellText(getExact(raw, ['sku', 'item sku', 'item code']));
    const barcodeCol = cellText(getExact(raw, ['barcode', 'bar code', 'ean', 'upc']));

    let name = cellText(getExact(raw, ['name', 'item name', 'title', 'product name']));
    let category = cellText(getExact(raw, ['category', 'categories']));
    let description = cellText(getExact(raw, ['description', 'desc']));
    let handle = cellText(getExact(raw, ['handle']));

    // Loyverse variant rows leave shared fields blank on siblings.
    if (name) carryName = name;
    else name = carryName;
    if (category) carryCategory = category;
    else category = carryCategory;
    if (description) carryDescription = description;
    else description = carryDescription;
    if (handle) carryHandle = handle;
    else handle = carryHandle;

    if (includedSku && !sku && !barcodeCol) continue;
    if (!name || (!sku && !barcodeCol)) continue;

    const barcode = barcodeCol || sku;
    const optionSpecs = getOptionSpecs(raw);
    const color = getOptionColor(raw);
    // Specs = all option values (or non-color options when color was split out)
    let scent = optionSpecs;
    if (color && scent.startsWith(`${color} · `)) {
      scent = scent.slice(color.length + 3);
    } else if (color && scent === color) {
      scent = '';
    }

    const available = cellText(getExact(raw, [
      'available for sale',
      'available',
      'active',
    ]));
    const active = !available || !/^(n|no|false|0)$/i.test(available);

    const lowStock = cellNumber(getExact(raw, [
      'low stock',
      'min stock',
      'low stock notification',
    ]), 5);

    products.push({
      title: name,
      description,
      category: category || 'General',
      collectionName: category || 'General',
      barcode,
      retailPrice: getPrice(raw),
      costPrice: cellNumber(getExact(raw, ['cost', 'wholesale cost', 'purchase cost']), 0),
      stockQuantity: getStock(raw),
      minStockAlert: Math.max(0, Math.trunc(lowStock || 5)),
      color,
      scent,
      showOnWebsite: false,
      active,
      handle: handle || undefined,
    });
  }

  return products;
}

/**
 * @param {File} file
 * @param {{
 *   existingProducts?: Array<{ id?: string, barcode?: string, sku?: string }>,
 *   onProgress?: (info: { done: number, total: number, title: string }) => void,
 * }} [opts]
 */
export async function importCatalogFromSpreadsheet(file, opts = {}) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured. Cannot import products.');
  }

  const rows = await parseCatalogSpreadsheet(file);
  const mapped = mapSpreadsheetRowsToProducts(rows);
  if (!mapped.length) {
    throw new Error('No valid products found. Need at least Name + SKU (or Barcode) columns.');
  }

  /** @type {Map<string, {
   *   id: string,
   *   showOnWebsite?: boolean,
   *   show_on_website?: boolean,
   *   imageUrls?: string[],
   *   image?: string | null,
   * }>} */
  const byBarcode = new Map();
  for (const product of opts.existingProducts || []) {
    const code = String(product.barcode || product.sku || '').trim();
    if (code && product.id) {
      byBarcode.set(code, {
        id: String(product.id),
        showOnWebsite: product.showOnWebsite,
        show_on_website: product.show_on_website,
        imageUrls: Array.isArray(product.imageUrls) ? product.imageUrls : undefined,
        image: product.image ?? null,
      });
    }
  }

  let created = 0;
  let updated = 0;
  const categories = new Set();
  const errors = [];

  for (let i = 0; i < mapped.length; i += 1) {
    const product = mapped[i];
    categories.add(product.category);
    opts.onProgress?.({
      done: i,
      total: mapped.length,
      title: product.title,
    });

    const existing = byBarcode.get(product.barcode);
    // New imports stay off the website; updates keep the current Push-to-Website setting.
    const showOnWebsite = existing
      ? (existing.showOnWebsite !== false && existing.show_on_website !== false)
      : false;

    const existingImages = existing?.imageUrls?.filter(Boolean)
      || (existing?.image ? [existing.image] : []);

    const payload = {
      title: product.title,
      description: product.description,
      category: product.category,
      collectionName: product.collectionName,
      barcode: product.barcode,
      retailPrice: product.retailPrice,
      costPrice: product.costPrice,
      stockQuantity: product.stockQuantity,
      minStockAlert: product.minStockAlert,
      color: product.color,
      scent: product.scent,
      showOnWebsite,
      show_on_website: showOnWebsite,
      active: product.active !== false,
      is_active: product.active !== false,
      imageUrls: existingImages,
      id: existing?.id || undefined,
    };

    try {
      const saved = await upsertProductRow(payload);
      const mappedSaved = mapProductFromDb(saved);
      if (mappedSaved?.id && product.barcode) {
        byBarcode.set(product.barcode, {
          id: String(mappedSaved.id),
          showOnWebsite,
          show_on_website: showOnWebsite,
        });
      }
      if (existing) updated += 1;
      else created += 1;
    } catch (err) {
      errors.push({
        title: product.title,
        barcode: product.barcode,
        message: err?.message || String(err),
      });
    }
  }

  opts.onProgress?.({
    done: mapped.length,
    total: mapped.length,
    title: 'Done',
  });

  return {
    total: mapped.length,
    created,
    updated,
    categories: [...categories].sort((a, b) => a.localeCompare(b)),
    errors,
  };
}
