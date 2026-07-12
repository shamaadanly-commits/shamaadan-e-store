-- Shamaadan — FIFO accounting / inventory schema (PostgreSQL / Supabase)
-- Run in Supabase SQL Editor after catalog_schema.sql
--
-- Converted from MySQL: SERIAL PKs, TIMESTAMP, separate CREATE INDEX,
-- no UNSIGNED / ENGINE / CHARSET. product_id is UUID to match public.products.

-- FIFO helper columns on the existing catalog products table
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS sku VARCHAR(64);
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS current_stock INT NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS products_sku_uidx
  ON public.products (sku)
  WHERE sku IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.inventory_batches (
  id SERIAL PRIMARY KEY,
  product_id UUID NOT NULL,
  supplier_unit_price DECIMAL(14, 4) NOT NULL DEFAULT 0,
  shipping_cost_allocated DECIMAL(14, 4) NOT NULL DEFAULT 0,
  landed_unit_cost DECIMAL(14, 4) NOT NULL DEFAULT 0,
  quantity_received INT NOT NULL,
  quantity_remaining INT NOT NULL,
  received_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_batches_product
    FOREIGN KEY (product_id) REFERENCES public.products (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT chk_batches_qty_received CHECK (quantity_received > 0),
  CONSTRAINT chk_batches_qty_remaining CHECK (quantity_remaining >= 0)
);

CREATE INDEX IF NOT EXISTS idx_batches_fifo
  ON public.inventory_batches (product_id, received_at, id);
CREATE INDEX IF NOT EXISTS idx_batches_remaining
  ON public.inventory_batches (product_id, quantity_remaining);

CREATE TABLE IF NOT EXISTS public.sales_items (
  id SERIAL PRIMARY KEY,
  product_id UUID NOT NULL,
  batch_id INT NOT NULL,
  quantity INT NOT NULL,
  unit_price DECIMAL(14, 4) NOT NULL,
  cogs_unit_cost DECIMAL(14, 4) NOT NULL,
  sold_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sales_product
    FOREIGN KEY (product_id) REFERENCES public.products (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_sales_batch
    FOREIGN KEY (batch_id) REFERENCES public.inventory_batches (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT chk_sales_qty CHECK (quantity > 0)
);

CREATE INDEX IF NOT EXISTS idx_sales_sold_at
  ON public.sales_items (sold_at);
CREATE INDEX IF NOT EXISTS idx_sales_product_sold
  ON public.sales_items (product_id, sold_at);

CREATE TABLE IF NOT EXISTS public.inventory_waste (
  id SERIAL PRIMARY KEY,
  product_id UUID NOT NULL,
  batch_id INT NOT NULL,
  quantity INT NOT NULL,
  waste_reason VARCHAR(255) NOT NULL,
  recorded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_waste_product
    FOREIGN KEY (product_id) REFERENCES public.products (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_waste_batch
    FOREIGN KEY (batch_id) REFERENCES public.inventory_batches (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT chk_waste_qty CHECK (quantity > 0)
);

CREATE INDEX IF NOT EXISTS idx_waste_recorded
  ON public.inventory_waste (recorded_at);

CREATE TABLE IF NOT EXISTS public.operating_expenses (
  id SERIAL PRIMARY KEY,
  expense_name VARCHAR(255) NOT NULL,
  amount DECIMAL(14, 4) NOT NULL,
  expense_date DATE NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_expense_amount CHECK (amount >= 0)
);

CREATE INDEX IF NOT EXISTS idx_expense_date
  ON public.operating_expenses (expense_date);

NOTIFY pgrst, 'reload schema';
