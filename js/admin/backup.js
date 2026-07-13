/**
 * Daily accounting & purchases backup → PDF.
 *
 * Pulls every Accounting/Purchase table via getAccountingBackup() and renders a
 * dated, multi-section PDF the owner can download and archive each day.
 *
 * jsPDF + autotable are lazy-loaded from esm.sh only when the button is pressed,
 * so they never slow down the dashboard boot.
 */
import { getAccountingBackup } from '../../shared/supabase.js';

const JSPDF_URL = 'https://esm.sh/jspdf@2.5.2';
const AUTOTABLE_URL = 'https://esm.sh/jspdf-autotable@3.8.4';

// Human-friendly section titles + preferred column order for known tables.
const SECTIONS = [
  { key: 'supplier_invoices', title: 'Supplier Invoices' },
  { key: 'supplier_invoice_items', title: 'Invoice Line Items (Landed Cost)' },
  { key: 'inventory_batches', title: 'Inventory Batches (FIFO)' },
  { key: 'inventory_transactions', title: 'Inventory Transactions' },
  { key: 'sales_items', title: 'Sales Items' },
  { key: 'inventory_waste', title: 'Inventory Waste' },
  { key: 'operating_expenses', title: 'Operating Expenses' },
];

function fmtDate(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function cellValue(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') {
    return Number.isInteger(v) ? String(v) : v.toFixed(2);
  }
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'object') {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  let s = String(v);
  // Trim ISO timestamps to something readable.
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) s = s.replace('T', ' ').slice(0, 16);
  if (s.length > 60) s = `${s.slice(0, 57)}…`;
  return s;
}

function columnsFor(rows) {
  const cols = [];
  const seen = new Set();
  for (const row of rows) {
    for (const k of Object.keys(row || {})) {
      if (!seen.has(k)) {
        seen.add(k);
        cols.push(k);
      }
    }
  }
  return cols;
}

function sumField(rows, field) {
  return rows.reduce((acc, r) => acc + (Number(r?.[field]) || 0), 0);
}

/**
 * Build and download the daily backup PDF.
 * @param {(msg: string, tone?: 'ok'|'error'|'') => void} [onStatus]
 */
export async function downloadAccountingBackupPdf(onStatus = () => {}) {
  onStatus('Preparing backup…', '');

  const [{ jsPDF }, autoTableMod, data] = await Promise.all([
    import(/* @vite-ignore */ JSPDF_URL),
    import(/* @vite-ignore */ AUTOTABLE_URL),
    getAccountingBackup(),
  ]);
  const autoTable = autoTableMod.default || autoTableMod;

  const today = new Date();
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 32;
  const gold = [201, 168, 76];
  const dark = [26, 21, 8];

  // ── Cover / header ────────────────────────────────────────────────
  doc.setFillColor(...dark);
  doc.rect(0, 0, pageWidth, 70, 'F');
  doc.setTextColor(...gold);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('Shamaadan — Accounting & Purchases Backup', margin, 34);
  doc.setTextColor(230, 227, 217);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Backup date: ${fmtDate(today)}    Generated: ${today.toLocaleString()}`, margin, 54);

  let cursorY = 90;

  // ── Summary box ───────────────────────────────────────────────────
  const invoices = data.supplier_invoices || [];
  const summaryRows = [
    ['Supplier invoices', String(invoices.length)],
    ['Total raw cost', sumField(invoices, 'total_raw_cost').toFixed(2)],
    ['Total shipping/transport', sumField(invoices, 'total_shipping_transport_cost').toFixed(2)],
    ['Total customs/duties', sumField(invoices, 'total_customs_duties_cost').toFixed(2)],
    ['Total overhead', sumField(invoices, 'total_overhead_cost').toFixed(2)],
    ['Total landed cost', sumField(invoices, 'total_landed_cost').toFixed(2)],
    ['Operating expenses (count)', String((data.operating_expenses || []).length)],
    ['Waste records', String((data.inventory_waste || []).length)],
  ];

  doc.setTextColor(...dark);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('Summary', margin, cursorY);
  cursorY += 8;

  autoTable(doc, {
    startY: cursorY,
    margin: { left: margin, right: margin },
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: gold, textColor: dark, fontStyle: 'bold' },
    head: [['Metric', 'Value']],
    body: summaryRows,
    columnStyles: { 1: { halign: 'right' } },
  });
  cursorY = doc.lastAutoTable.finalY + 20;

  // ── One section per table ─────────────────────────────────────────
  for (const section of SECTIONS) {
    const rows = data[section.key] || [];

    if (cursorY > doc.internal.pageSize.getHeight() - 80) {
      doc.addPage();
      cursorY = 50;
    }

    doc.setTextColor(...dark);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(`${section.title}  (${rows.length})`, margin, cursorY);
    cursorY += 6;

    if (!rows.length) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(9);
      doc.setTextColor(120, 115, 104);
      doc.text('No records.', margin, cursorY + 12);
      cursorY += 30;
      continue;
    }

    const cols = columnsFor(rows);
    const body = rows.map((r) => cols.map((c) => cellValue(r[c])));

    autoTable(doc, {
      startY: cursorY + 4,
      margin: { left: margin, right: margin },
      theme: 'striped',
      styles: { fontSize: 7, cellPadding: 3, overflow: 'linebreak' },
      headStyles: { fillColor: dark, textColor: gold, fontStyle: 'bold', fontSize: 7 },
      head: [cols],
      body,
    });
    cursorY = doc.lastAutoTable.finalY + 22;
  }

  // ── Page numbers ──────────────────────────────────────────────────
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i += 1) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(150, 145, 135);
    doc.text(
      `Shamaadan E-Store · Page ${i} of ${pageCount}`,
      pageWidth - margin,
      doc.internal.pageSize.getHeight() - 16,
      { align: 'right' },
    );
  }

  doc.save(`shamaadan-accounting-backup-${fmtDate(today)}.pdf`);
  onStatus('Backup downloaded.', 'ok');
}
