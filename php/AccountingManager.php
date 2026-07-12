<?php

declare(strict_types=1);

/**
 * AccountingManager — FIFO inventory, landed cost, waste, and daily P&L.
 *
 * Vanilla PHP 8.x + PDO. No frameworks.
 * All write paths run inside transactions with parameterized queries.
 */
final class AccountingManager
{
    public function __construct(
        private readonly PDO $pdo,
    ) {
        $this->pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $this->pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
        $this->pdo->setAttribute(PDO::ATTR_EMULATE_PREPARES, false);
    }

    /**
     * Receive a new inventory batch and compute landed unit cost.
     *
     * Landed cost = supplier unit price + (allocated shipping / qty).
     * Shipping is treated as the portion of global overhead already allocated
     * to this line (pro-rata at the purchase-order layer before calling this).
     *
     * @return array{ok: bool, batch_id?: int, landed_unit_cost?: float, error?: string}
     */
    public function addInventoryBatch(
        int $productId,
        int $qty,
        float $supplierPrice,
        float $allocatedShipping,
    ): array {
        if ($productId <= 0) {
            return $this->fail('Invalid product id.');
        }
        if ($qty <= 0) {
            return $this->fail('Quantity received must be greater than zero.');
        }
        if ($supplierPrice < 0 || $allocatedShipping < 0) {
            return $this->fail('Costs cannot be negative.');
        }

        $landedUnitCost = $this->roundMoney(
            $supplierPrice + ($allocatedShipping / $qty),
        );

        try {
            $this->pdo->beginTransaction();

            if (!$this->productExists($productId)) {
                $this->pdo->rollBack();
                return $this->fail('Product not found.');
            }

            $stmt = $this->pdo->prepare(
                'INSERT INTO inventory_batches (
                    product_id,
                    supplier_unit_price,
                    shipping_cost_allocated,
                    landed_unit_cost,
                    quantity_received,
                    quantity_remaining,
                    received_at
                ) VALUES (
                    :product_id,
                    :supplier_unit_price,
                    :shipping_cost_allocated,
                    :landed_unit_cost,
                    :quantity_received,
                    :quantity_remaining,
                    NOW()
                )',
            );

            $stmt->execute([
                ':product_id' => $productId,
                ':supplier_unit_price' => $this->roundMoney($supplierPrice),
                ':shipping_cost_allocated' => $this->roundMoney($allocatedShipping),
                ':landed_unit_cost' => $landedUnitCost,
                ':quantity_received' => $qty,
                ':quantity_remaining' => $qty,
            ]);

            $batchId = (int) $this->pdo->lastInsertId();
            $this->adjustProductStock($productId, $qty);

            $this->pdo->commit();

            return [
                'ok' => true,
                'batch_id' => $batchId,
                'landed_unit_cost' => $landedUnitCost,
            ];
        } catch (Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            return $this->fail('Failed to add inventory batch: ' . $e->getMessage());
        }
    }

    /**
     * Process a sale using FIFO batch consumption.
     * Deducts from oldest batches first and logs each slice into sales_items
     * with the batch's landed_unit_cost as cogs_unit_cost.
     *
     * @return array{
     *   ok: bool,
     *   lines?: list<array{batch_id: int, quantity: int, cogs_unit_cost: float}>,
     *   total_cogs?: float,
     *   gross_revenue?: float,
     *   error?: string
     * }
     */
    public function processSale(int $productId, int $qty, float $sellingPrice): array
    {
        if ($productId <= 0) {
            return $this->fail('Invalid product id.');
        }
        if ($qty <= 0) {
            return $this->fail('Sale quantity must be greater than zero.');
        }
        if ($sellingPrice < 0) {
            return $this->fail('Selling price cannot be negative.');
        }

        try {
            $this->pdo->beginTransaction();

            $available = $this->getSellableStock($productId);
            if ($available < $qty) {
                $this->pdo->rollBack();
                return $this->fail(sprintf(
                    'Insufficient stock. Requested %d, available %d.',
                    $qty,
                    $available,
                ));
            }

            $remaining = $qty;
            $lines = [];
            $totalCogs = 0.0;

            $batches = $this->fetchActiveBatchesFifo($productId);

            foreach ($batches as $batch) {
                if ($remaining <= 0) {
                    break;
                }

                $batchId = (int) $batch['id'];
                $batchQty = (int) $batch['quantity_remaining'];
                $landed = (float) $batch['landed_unit_cost'];
                $take = min($remaining, $batchQty);

                if ($take <= 0) {
                    continue;
                }

                $update = $this->pdo->prepare(
                    'UPDATE inventory_batches
                     SET quantity_remaining = quantity_remaining - :take
                     WHERE id = :id AND quantity_remaining >= :take',
                );
                $update->execute([
                    ':take' => $take,
                    ':id' => $batchId,
                ]);

                if ($update->rowCount() !== 1) {
                    throw new RuntimeException('Concurrent stock change on batch ' . $batchId);
                }

                $insert = $this->pdo->prepare(
                    'INSERT INTO sales_items (
                        product_id,
                        batch_id,
                        quantity,
                        unit_price,
                        cogs_unit_cost,
                        sold_at
                    ) VALUES (
                        :product_id,
                        :batch_id,
                        :quantity,
                        :unit_price,
                        :cogs_unit_cost,
                        NOW()
                    )',
                );
                $insert->execute([
                    ':product_id' => $productId,
                    ':batch_id' => $batchId,
                    ':quantity' => $take,
                    ':unit_price' => $this->roundMoney($sellingPrice),
                    ':cogs_unit_cost' => $this->roundMoney($landed),
                ]);

                $lines[] = [
                    'batch_id' => $batchId,
                    'quantity' => $take,
                    'cogs_unit_cost' => $this->roundMoney($landed),
                ];
                $totalCogs += $take * $landed;
                $remaining -= $take;
            }

            if ($remaining > 0) {
                throw new RuntimeException('FIFO exhaustion: could not allocate all units.');
            }

            $this->adjustProductStock($productId, -$qty);
            $this->pdo->commit();

            return [
                'ok' => true,
                'lines' => $lines,
                'total_cogs' => $this->roundMoney($totalCogs),
                'gross_revenue' => $this->roundMoney($qty * $sellingPrice),
            ];
        } catch (Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            return $this->fail('Sale failed: ' . $e->getMessage());
        }
    }

    /**
     * Log broken / damaged goods against the oldest active batches (FIFO).
     * Removes sellable quantity and records financial loss at landed cost.
     *
     * @return array{
     *   ok: bool,
     *   lines?: list<array{batch_id: int, quantity: int, landed_unit_cost: float, loss: float}>,
     *   total_loss?: float,
     *   error?: string
     * }
     */
    public function logWaste(int $productId, int $qty, string $reason): array
    {
        if ($productId <= 0) {
            return $this->fail('Invalid product id.');
        }
        if ($qty <= 0) {
            return $this->fail('Waste quantity must be greater than zero.');
        }

        $reason = trim($reason);
        if ($reason === '') {
            return $this->fail('Waste reason is required.');
        }

        try {
            $this->pdo->beginTransaction();

            $available = $this->getSellableStock($productId);
            if ($available < $qty) {
                $this->pdo->rollBack();
                return $this->fail(sprintf(
                    'Insufficient stock to waste. Requested %d, available %d.',
                    $qty,
                    $available,
                ));
            }

            $remaining = $qty;
            $lines = [];
            $totalLoss = 0.0;

            foreach ($this->fetchActiveBatchesFifo($productId) as $batch) {
                if ($remaining <= 0) {
                    break;
                }

                $batchId = (int) $batch['id'];
                $batchQty = (int) $batch['quantity_remaining'];
                $landed = (float) $batch['landed_unit_cost'];
                $take = min($remaining, $batchQty);

                if ($take <= 0) {
                    continue;
                }

                $update = $this->pdo->prepare(
                    'UPDATE inventory_batches
                     SET quantity_remaining = quantity_remaining - :take
                     WHERE id = :id AND quantity_remaining >= :take',
                );
                $update->execute([
                    ':take' => $take,
                    ':id' => $batchId,
                ]);

                if ($update->rowCount() !== 1) {
                    throw new RuntimeException('Concurrent stock change on batch ' . $batchId);
                }

                $loss = $this->roundMoney($take * $landed);

                $insert = $this->pdo->prepare(
                    'INSERT INTO inventory_waste (
                        product_id,
                        batch_id,
                        quantity,
                        waste_reason,
                        recorded_at
                    ) VALUES (
                        :product_id,
                        :batch_id,
                        :quantity,
                        :waste_reason,
                        NOW()
                    )',
                );
                $insert->execute([
                    ':product_id' => $productId,
                    ':batch_id' => $batchId,
                    ':quantity' => $take,
                    ':waste_reason' => $reason,
                ]);

                $lines[] = [
                    'batch_id' => $batchId,
                    'quantity' => $take,
                    'landed_unit_cost' => $this->roundMoney($landed),
                    'loss' => $loss,
                ];
                $totalLoss += $loss;
                $remaining -= $take;
            }

            if ($remaining > 0) {
                throw new RuntimeException('FIFO exhaustion while logging waste.');
            }

            $this->adjustProductStock($productId, -$qty);
            $this->pdo->commit();

            return [
                'ok' => true,
                'lines' => $lines,
                'total_loss' => $this->roundMoney($totalLoss),
            ];
        } catch (Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            return $this->fail('Waste log failed: ' . $e->getMessage());
        }
    }

    /**
     * Aggregate daily financials for a calendar date (Y-m-d).
     *
     * Net Profit = Gross Revenue − COGS − Waste Loss − Operating Expenses
     *
     * @return array{
     *   ok: bool,
     *   date?: string,
     *   gross_revenue?: float,
     *   total_cogs?: float,
     *   waste_loss?: float,
     *   operating_expenses?: float,
     *   net_profit?: float,
     *   units_sold?: int,
     *   units_wasted?: int,
     *   error?: string
     * }
     */
    public function getDailyFinancialReport(string $date): array
    {
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
            return $this->fail('Date must be in Y-m-d format.');
        }

        try {
            $salesStmt = $this->pdo->prepare(
                'SELECT
                    COALESCE(SUM(quantity * unit_price), 0) AS gross_revenue,
                    COALESCE(SUM(quantity * cogs_unit_cost), 0) AS total_cogs,
                    COALESCE(SUM(quantity), 0) AS units_sold
                 FROM sales_items
                 WHERE DATE(sold_at) = :report_date',
            );
            $salesStmt->execute([':report_date' => $date]);
            $sales = $salesStmt->fetch() ?: [];

            $wasteStmt = $this->pdo->prepare(
                'SELECT
                    COALESCE(SUM(w.quantity * b.landed_unit_cost), 0) AS waste_loss,
                    COALESCE(SUM(w.quantity), 0) AS units_wasted
                 FROM inventory_waste w
                 INNER JOIN inventory_batches b ON b.id = w.batch_id
                 WHERE DATE(w.recorded_at) = :report_date',
            );
            $wasteStmt->execute([':report_date' => $date]);
            $waste = $wasteStmt->fetch() ?: [];

            $expenseStmt = $this->pdo->prepare(
                'SELECT COALESCE(SUM(amount), 0) AS operating_expenses
                 FROM operating_expenses
                 WHERE expense_date = :report_date',
            );
            $expenseStmt->execute([':report_date' => $date]);
            $expenses = $expenseStmt->fetch() ?: [];

            $grossRevenue = $this->roundMoney((float) ($sales['gross_revenue'] ?? 0));
            $totalCogs = $this->roundMoney((float) ($sales['total_cogs'] ?? 0));
            $wasteLoss = $this->roundMoney((float) ($waste['waste_loss'] ?? 0));
            $operatingExpenses = $this->roundMoney((float) ($expenses['operating_expenses'] ?? 0));
            $netProfit = $this->roundMoney(
                $grossRevenue - $totalCogs - $wasteLoss - $operatingExpenses,
            );

            return [
                'ok' => true,
                'date' => $date,
                'gross_revenue' => $grossRevenue,
                'total_cogs' => $totalCogs,
                'waste_loss' => $wasteLoss,
                'operating_expenses' => $operatingExpenses,
                'net_profit' => $netProfit,
                'units_sold' => (int) ($sales['units_sold'] ?? 0),
                'units_wasted' => (int) ($waste['units_wasted'] ?? 0),
            ];
        } catch (Throwable $e) {
            return $this->fail('Report failed: ' . $e->getMessage());
        }
    }

    /**
     * Distribute a global shipping/overhead amount across purchase lines
     * pro-rata by supplier cost share, then create batches.
     *
     * Each line: ['product_id' => int, 'qty' => int, 'supplier_unit_price' => float]
     *
     * @param list<array{product_id: int, qty: int, supplier_unit_price: float}> $lines
     * @return array{ok: bool, batches?: list<array>, error?: string}
     */
    public function addPurchaseWithLandedCosts(array $lines, float $globalShipping): array
    {
        if ($lines === []) {
            return $this->fail('Purchase lines are required.');
        }
        if ($globalShipping < 0) {
            return $this->fail('Global shipping cannot be negative.');
        }

        $extendedCosts = [];
        $totalExtended = 0.0;

        foreach ($lines as $index => $line) {
            $productId = (int) ($line['product_id'] ?? 0);
            $qty = (int) ($line['qty'] ?? 0);
            $unit = (float) ($line['supplier_unit_price'] ?? -1);

            if ($productId <= 0 || $qty <= 0 || $unit < 0) {
                return $this->fail('Invalid purchase line at index ' . $index);
            }

            $extended = $qty * $unit;
            $extendedCosts[$index] = $extended;
            $totalExtended += $extended;
        }

        if ($totalExtended <= 0 && $globalShipping > 0) {
            return $this->fail('Cannot allocate shipping when total supplier cost is zero.');
        }

        $created = [];

        try {
            $this->pdo->beginTransaction();

            foreach ($lines as $index => $line) {
                $share = $totalExtended > 0
                    ? ($extendedCosts[$index] / $totalExtended) * $globalShipping
                    : 0.0;

                $result = $this->addInventoryBatchInsideTransaction(
                    (int) $line['product_id'],
                    (int) $line['qty'],
                    (float) $line['supplier_unit_price'],
                    $this->roundMoney($share),
                );

                if (!$result['ok']) {
                    throw new RuntimeException($result['error'] ?? 'Batch create failed.');
                }

                $created[] = $result;
            }

            $this->pdo->commit();

            return [
                'ok' => true,
                'batches' => $created,
            ];
        } catch (Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            return $this->fail('Landed-cost purchase failed: ' . $e->getMessage());
        }
    }

    // ── Internals ────────────────────────────────────────────────────

    /**
     * Variant of addInventoryBatch that assumes an outer transaction is open.
     *
     * @return array{ok: bool, batch_id?: int, landed_unit_cost?: float, error?: string}
     */
    private function addInventoryBatchInsideTransaction(
        int $productId,
        int $qty,
        float $supplierPrice,
        float $allocatedShipping,
    ): array {
        if (!$this->productExists($productId)) {
            return $this->fail('Product not found.');
        }

        $landedUnitCost = $this->roundMoney(
            $supplierPrice + ($allocatedShipping / $qty),
        );

        $stmt = $this->pdo->prepare(
            'INSERT INTO inventory_batches (
                product_id,
                supplier_unit_price,
                shipping_cost_allocated,
                landed_unit_cost,
                quantity_received,
                quantity_remaining,
                received_at
            ) VALUES (
                :product_id,
                :supplier_unit_price,
                :shipping_cost_allocated,
                :landed_unit_cost,
                :quantity_received,
                :quantity_remaining,
                NOW()
            )',
        );

        $stmt->execute([
            ':product_id' => $productId,
            ':supplier_unit_price' => $this->roundMoney($supplierPrice),
            ':shipping_cost_allocated' => $this->roundMoney($allocatedShipping),
            ':landed_unit_cost' => $landedUnitCost,
            ':quantity_received' => $qty,
            ':quantity_remaining' => $qty,
        ]);

        $batchId = (int) $this->pdo->lastInsertId();
        $this->adjustProductStock($productId, $qty);

        return [
            'ok' => true,
            'batch_id' => $batchId,
            'landed_unit_cost' => $landedUnitCost,
        ];
    }

    /**
     * @return list<array{id: int|string, quantity_remaining: int|string, landed_unit_cost: float|string}>
     */
    private function fetchActiveBatchesFifo(int $productId): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT id, quantity_remaining, landed_unit_cost
             FROM inventory_batches
             WHERE product_id = :product_id
               AND quantity_remaining > 0
             ORDER BY received_at ASC, id ASC
             FOR UPDATE',
        );
        $stmt->execute([':product_id' => $productId]);

        /** @var list<array{id: int|string, quantity_remaining: int|string, landed_unit_cost: float|string}> */
        return $stmt->fetchAll();
    }

    private function getSellableStock(int $productId): int
    {
        $stmt = $this->pdo->prepare(
            'SELECT COALESCE(SUM(quantity_remaining), 0) AS sellable
             FROM inventory_batches
             WHERE product_id = :product_id',
        );
        $stmt->execute([':product_id' => $productId]);
        $row = $stmt->fetch();

        return (int) ($row['sellable'] ?? 0);
    }

    private function productExists(int $productId): bool
    {
        $stmt = $this->pdo->prepare('SELECT 1 FROM products WHERE id = :id LIMIT 1');
        $stmt->execute([':id' => $productId]);

        return (bool) $stmt->fetchColumn();
    }

    private function adjustProductStock(int $productId, int $delta): void
    {
        $stmt = $this->pdo->prepare(
            'UPDATE products
             SET current_stock = GREATEST(0, current_stock + :delta)
             WHERE id = :id',
        );
        $stmt->execute([
            ':delta' => $delta,
            ':id' => $productId,
        ]);
    }

    private function roundMoney(float $amount): float
    {
        return round($amount, 4);
    }

    /**
     * @return array{ok: false, error: string}
     */
    private function fail(string $message): array
    {
        return [
            'ok' => false,
            'error' => $message,
        ];
    }
}
