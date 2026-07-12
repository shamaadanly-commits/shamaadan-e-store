/**
 * Barcode generator + printer (Code 128, pure JS — no external deps).
 *
 * - generateBarcodeValue(): a 13-digit EAN-style internal code (GS1
 *   "restricted circulation" prefix 20, valid check digit).
 * - barcodeSvg(value): renders the value as a scannable Code 128 SVG.
 *   The POS scanner supports code_128, so scanning returns the same string.
 * - renderBarcodeInto(host, value): draws a preview into a DOM element.
 * - printBarcodeLabels({ value, title, price, copies }): opens the device
 *   print dialog (which lists the available printers) with label(s).
 */

// Code 128 bar/space width patterns (indices 0-102 = values, 103-105 = start
// A/B/C, 106 = stop). Each digit is a module width; patterns start with a bar.
const CODE128_PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
];

const START_B = 104;
const STOP = 106;

/**
 * Encode ASCII text (32-126) into Code 128 code set B symbol values.
 * @param {string} text
 * @returns {number[]}
 */
function encodeCode128B(text) {
  const codes = [START_B];
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    if (c < 32 || c > 126) {
      throw new Error('Barcode may only contain standard letters, numbers, and symbols.');
    }
    codes.push(c - 32);
  }
  let checksum = START_B;
  for (let i = 1; i < codes.length; i += 1) {
    checksum += codes[i] * i;
  }
  codes.push(checksum % 103);
  codes.push(STOP);
  return codes;
}

/**
 * EAN-13 check digit for a 12-digit string.
 * @param {string} digits12
 * @returns {number}
 */
function eanCheckDigit(digits12) {
  let sum = 0;
  for (let i = 0; i < 12; i += 1) {
    const n = Number(digits12[i]);
    sum += i % 2 === 0 ? n : n * 3;
  }
  return (10 - (sum % 10)) % 10;
}

/**
 * Generate a unique 13-digit internal barcode value.
 * Prefix "20" = GS1 restricted circulation (in-store use), so it will not
 * collide with real manufacturer EAN-13 codes.
 * @returns {string}
 */
export function generateBarcodeValue() {
  let base = '20';
  // 10 more digits derived from time + randomness for practical uniqueness.
  const seed = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
  for (let i = 0; i < 10; i += 1) {
    base += seed[seed.length - 1 - i] ?? Math.floor(Math.random() * 10);
  }
  base = base.slice(0, 12).replace(/\D/g, '0').padEnd(12, '0');
  return base + eanCheckDigit(base);
}

/**
 * Render a value as a scannable Code 128 SVG string.
 * @param {string} value
 * @param {{ moduleWidth?: number, height?: number, showText?: boolean }} [opts]
 * @returns {string} SVG markup
 */
export function barcodeSvg(value, opts = {}) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error('No barcode value to render.');

  const moduleWidth = opts.moduleWidth ?? 2;
  const barsHeight = opts.height ?? 64;
  const showText = opts.showText !== false;
  const quietModules = 10;
  const textGap = showText ? 18 : 0;

  const codes = encodeCode128B(text);
  const widths = codes.map((code) => CODE128_PATTERNS[code]).join('');

  let x = quietModules * moduleWidth;
  let isBar = true;
  let rects = '';
  for (const ch of widths) {
    const w = Number(ch) * moduleWidth;
    if (isBar) {
      rects += `<rect x="${x}" y="0" width="${w}" height="${barsHeight}" fill="#000"/>`;
    }
    x += w;
    isBar = !isBar;
  }

  const totalWidth = x + quietModules * moduleWidth;
  const totalHeight = barsHeight + textGap;
  const label = showText
    ? `<text x="${totalWidth / 2}" y="${barsHeight + 14}" text-anchor="middle" font-family="monospace" font-size="13" letter-spacing="1" fill="#000">${escapeXml(text)}</text>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${totalHeight}" viewBox="0 0 ${totalWidth} ${totalHeight}" role="img" aria-label="Barcode ${escapeXml(text)}">`
    + `<rect x="0" y="0" width="${totalWidth}" height="${totalHeight}" fill="#fff"/>${rects}${label}</svg>`;
}

/**
 * Draw a barcode preview into a host element.
 * @param {HTMLElement} host
 * @param {string} value
 */
export function renderBarcodeInto(host, value) {
  if (!host) return;
  host.innerHTML = barcodeSvg(value, { moduleWidth: 2, height: 56 });
}

/**
 * Open the device print dialog with one or more barcode labels.
 * The browser cannot enumerate printers directly; window.print() surfaces
 * the OS print dialog, which lists every printer available on the device.
 * @param {{ value: string, title?: string, price?: string|number, copies?: number }} params
 */
export function printBarcodeLabels({ value, title = '', price = '', copies = 1 }) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error('Enter or generate a barcode first.');

  const svg = barcodeSvg(text, { moduleWidth: 2, height: 60 });
  const count = Math.max(1, Math.min(50, Number(copies) || 1));
  const priceLabel = price !== '' && price != null && !Number.isNaN(Number(price))
    ? new Intl.NumberFormat('en-LY', { style: 'currency', currency: 'LYD' }).format(Number(price))
    : '';

  const labelHtml = `
    <div class="label">
      ${title ? `<div class="label__title">${escapeHtml(title)}</div>` : ''}
      <div class="label__barcode">${svg}</div>
      ${priceLabel ? `<div class="label__price">${escapeHtml(priceLabel)}</div>` : ''}
    </div>`;

  const win = window.open('', '_blank', 'width=520,height=640');
  if (!win) {
    throw new Error('Print window was blocked. Allow pop-ups for this site, then try again.');
  }

  win.document.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Print barcode — ${escapeHtml(text)}</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; padding: 16px; font-family: system-ui, sans-serif; background: #fff; color: #000; }
  .sheet { display: flex; flex-wrap: wrap; gap: 10px; }
  .label { border: 1px dashed #ccc; padding: 8px 10px; text-align: center; page-break-inside: avoid; }
  .label__title { font-size: 12px; font-weight: 600; margin-bottom: 4px; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .label__price { font-size: 13px; font-weight: 700; margin-top: 2px; }
  .label svg { display: block; margin: 0 auto; }
  @media print {
    body { padding: 0; }
    .label { border: none; }
    @page { margin: 6mm; }
  }
</style>
</head>
<body>
  <div class="sheet">${Array.from({ length: count }, () => labelHtml).join('')}</div>
  <script>
    window.onload = function () { setTimeout(function () { window.focus(); window.print(); }, 150); };
    window.onafterprint = function () { window.close(); };
  <\/script>
</body>
</html>`);
  win.document.close();
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeXml(str) {
  return escapeHtml(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
