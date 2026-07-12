-- Shamaadan — Foreign Purchase Invoice / Landed Cost tables (PostgreSQL / Supabase)
-- Run in Supabase SQL Editor AFTER accounting_fifo.sql (needs public.products
-- and public.inventory_batches). Consumed by php/PurchaseInvoiceManager.php.

-- ── Invoice header + cost totals ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.supplier_invoices (
  id SERIAL PRIMARY KEY,
  supplier_name VARCHAR(255) NOT NULL,
  invoice_number VARCHAR(128),
  invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
  currency VARCHAR(8) NOT NULL DEFAULT 'LYD',
  total_raw_cost DECIMAL(14, 4) NOT NULL DEFAULT 0,
  total_shipping_transport_cost DECIMAL(14, 4) NOT NULL DEFAULT 0,
  total_customs_duties_cost DECIMAL(14, 4) NOT NULL DEFAULT 0,
  total_overhead_cost DECIMAL(14, 4) NOT NULL DEFAULT 0,
  total_landed_cost DECIMAL(14, 4) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_supplier_invoices_costs CHECK (
    total_raw_cost >= 0
    AND total_shipping_transport_cost >= 0
    AND total_customs_duties_cost >= 0
    AND total_overhead_cost >= 0
    AND total_landed_cost >= 0
  )
);

CREATE INDEX IF NOT EXISTS idx_supplier_invoices_date
  ON public.supplier_invoices (invoice_date);
CREATE INDEX IF NOT EXISTS idx_supplier_invoices_supplier
  ON public.supplier_invoices (supplier_name);

-- ── Per-line raw / allocated / landed costs ──────────────────────────
CREATE TABLE IF NOT EXISTS public.supplier_invoice_items (
  id SERIAL PRIMARY KEY,
  invoice_id INT NOT NULL,
  product_id UUID NOT NULL,
  supplier_unit_price DECIMAL(14, 4) NOT NULL,
  quantity_ordered INT NOT NULL,
  raw_line_cost DECIMAL(14, 4) NOT NULL,
  allocated_overhead DECIMAL(14, 4) NOT NULL DEFAULT 0,
  final_landed_unit_cost DECIMAL(14, 4) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sii_invoice
    FOREIGN KEY (invoice_id) REFERENCES public.supplier_invoices (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_sii_product
    FOREIGN KEY (product_id) REFERENCES public.products (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT chk_sii_qty CHECK (quantity_ordered > 0),
  CONSTRAINT chk_sii_costs CHECK (
    supplier_unit_price >= 0
    AND raw_line_cost >= 0
    AND allocated_overhead >= 0
    AND final_landed_unit_cost >= 0
  )
);

CREATE INDEX IF NOT EXISTS idx_sii_invoice
  ON public.supplier_invoice_items (invoice_id);
CREATE INDEX IF NOT EXISTS idx_sii_product
  ON public.supplier_invoice_items (product_id);

NOTIFY pgrst, 'reload schema';
