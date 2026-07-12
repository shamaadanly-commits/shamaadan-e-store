-- Shamaadan — FIFO accounting / inventory schema (MySQL 8+)
-- Supports AccountingManager.php (landed cost, sales COGS, waste, daily P&L)

CREATE TABLE IF NOT EXISTS products (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  sku VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  current_stock INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS inventory_batches (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  product_id INT UNSIGNED NOT NULL,
  supplier_unit_price DECIMAL(14, 4) NOT NULL DEFAULT 0,
  shipping_cost_allocated DECIMAL(14, 4) NOT NULL DEFAULT 0,
  landed_unit_cost DECIMAL(14, 4) NOT NULL DEFAULT 0,
  quantity_received INT NOT NULL,
  quantity_remaining INT NOT NULL,
  received_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_batches_product
    FOREIGN KEY (product_id) REFERENCES products (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT chk_batches_qty_received CHECK (quantity_received > 0),
  CONSTRAINT chk_batches_qty_remaining CHECK (quantity_remaining >= 0),
  INDEX idx_batches_fifo (product_id, received_at, id),
  INDEX idx_batches_remaining (product_id, quantity_remaining)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sales_items (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  product_id INT UNSIGNED NOT NULL,
  batch_id INT UNSIGNED NOT NULL,
  quantity INT NOT NULL,
  unit_price DECIMAL(14, 4) NOT NULL,
  cogs_unit_cost DECIMAL(14, 4) NOT NULL,
  sold_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sales_product
    FOREIGN KEY (product_id) REFERENCES products (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_sales_batch
    FOREIGN KEY (batch_id) REFERENCES inventory_batches (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT chk_sales_qty CHECK (quantity > 0),
  INDEX idx_sales_sold_at (sold_at),
  INDEX idx_sales_product_sold (product_id, sold_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS inventory_waste (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  product_id INT UNSIGNED NOT NULL,
  batch_id INT UNSIGNED NOT NULL,
  quantity INT NOT NULL,
  waste_reason VARCHAR(255) NOT NULL,
  recorded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_waste_product
    FOREIGN KEY (product_id) REFERENCES products (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_waste_batch
    FOREIGN KEY (batch_id) REFERENCES inventory_batches (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT chk_waste_qty CHECK (quantity > 0),
  INDEX idx_waste_recorded (recorded_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS operating_expenses (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  expense_name VARCHAR(255) NOT NULL,
  amount DECIMAL(14, 4) NOT NULL,
  expense_date DATE NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_expense_amount CHECK (amount >= 0),
  INDEX idx_expense_date (expense_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
