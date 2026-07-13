<?php

declare(strict_types=1);

namespace Shamaadan\Purchasing;

use InvalidArgumentException;
use PDO;
use RuntimeException;
use Throwable;

/**
 * Landed Cost & Inventory Batch engine for Shamaadan E-Store.
 *
 * Takes a supplier invoice (raw goods cost) plus its shipping/transport and
 * customs overhead, pro-rata-allocates that overhead across the product lines
 * by raw-cost weight, and persists everything atomically:
 *
 *   supplier_invoices   — invoice header + cost totals (returns invoice_id)
 *   inventory_batches   — one FIFO batch per line (quantity_remaining = received)
 *   products            — running stock incremented
 *
 * Requires (run once in Supabase SQL Editor):
 *   sql/accounting_fifo.sql     (inventory_batches, products.current_stock)
 *   sql/supplier_invoices.sql   (supplier_invoices)
 *
 * Usage:
 *   $pdo = new PDO($dsn, $user, $pass);
 *   $engine = new LandedCostEngine($pdo);
 *   try {
 *       $engine->intakeSupplierInvoice($invoiceData, $productsList);
 *   } catch (Throwable $e) {
 *       // nothing was committed — inspect $e->getMessage()
 *   }
 */
final class LandedCostEngine
{
    /** Monetary scale for DECIMAL(14,4) columns. */
    private const MONEY_SCALE = 4;

    private PDO $pdo;

    public function __construct(PDO $pdo)
    {
        $this->pdo = $pdo;
        // Force statement failures to throw so the transaction can roll back.
        $this->pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $this->pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    }

    /**
     * Intake a supplier invoice end-to-end inside one DB transaction.
     *
     * @param array<string,mixed>            $invoiceData Header fields (see normalizeInvoice()).
     * @param array<int,array<string,mixed>> $productsList Product lines (see normalizeProducts()).
     *
     * @return bool True on success. On failure the transaction is rolled back
     *              and an exception is thrown with a descriptive message.
     *
     * @throws InvalidArgumentException On invalid/missing input.
     * @throws RuntimeException         On persistence failure.
     */
    public function intakeSupplierInvoice(array $invoiceData, array $productsList): bool
    {
        // ── 1. Validate & normalize ──────────────────────────────────────
        if ($productsList === []) {
            throw new InvalidArgumentException('Supplier invoice must contain at least one product line.');
        }

        $invoice = $this->normalizeInvoice($invoiceData);
        $lines   = $this->normalizeProducts($productsList);

        // ── 2. Allocation overhead = shipping/transport + customs/duties ─
        $allocationOverhead = $this->money(
            $invoice['total_shipping_transport_cost'] + $invoice['total_customs_duties_cost']
        );

        // Total raw invoice cost (basis for the pro-rata weights).
        $totalRawCost = 0.0;
        foreach ($lines as $line) {
            $totalRawCost += $line['raw_line_cost'];
        }
        $totalRawCost = $this->money($totalRawCost);

        if ($totalRawCost <= 0.0) {
            throw new InvalidArgumentException(
                'Total raw invoice cost must be greater than zero to allocate overhead.'
            );
        }

        // ── 3. Pro-rata landed cost mapping ──────────────────────────────
        // Weight each line by its share of raw cost. The final line absorbs
        // the rounding remainder so allocations sum to the overhead exactly.
        $mapped         = [];
        $allocatedSoFar = 0.0;
        $lastIndex      = count($lines) - 1;

        foreach ($lines as $index => $line) {
            if ($index === $lastIndex) {
                $allocatedShare = $this->money($allocationOverhead - $allocatedSoFar);
            } else {
                $share          = $line['raw_line_cost'] / $totalRawCost;
                $allocatedShare = $this->money($allocationOverhead * $share);
                $allocatedSoFar += $allocatedShare;
            }

            if ($allocatedShare < 0.0) {
                $allocatedShare = 0.0; // guard rounding drift
            }

            $landedUnitCost = $this->money(
                $line['supplier_unit_price'] + ($allocatedShare / $line['quantity'])
            );

            $mapped[] = $line + [
                'allocated_overhead_share' => $allocatedShare,
                'landed_unit_cost'         => $landedUnitCost,
            ];
        }

        $totalLandedCost = 0.0;
        foreach ($mapped as $line) {
            $totalLandedCost += $line['landed_unit_cost'] * $line['quantity'];
        }
        $totalLandedCost = $this->money($totalLandedCost);

        // ── 4. Persist atomically ────────────────────────────────────────
        $this->pdo->beginTransaction();
        try {
            $invoiceId = $this->insertSupplierInvoice(
                $invoice,
                $totalRawCost,
                $allocationOverhead,
                $totalLandedCost
            );

            foreach ($mapped as $line) {
                $this->insertInventoryBatch($line);
                $this->incrementProductStock($line['product_id'], $line['quantity']);
            }

            $this->pdo->commit();

            return true;
        } catch (Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw new RuntimeException(
                'Supplier invoice intake failed; transaction rolled back: ' . $e->getMessage(),
                0,
                $e
            );
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // Database executions
    // ─────────────────────────────────────────────────────────────────────

    /**
     * Insert the invoice header and return the generated sequence id.
     *
     * @param array<string,mixed> $invoice
     */
    private function insertSupplierInvoice(
        array $invoice,
        float $totalRawCost,
        float $allocationOverhead,
        float $totalLandedCost
    ): int {
        $sql = 'INSERT INTO public.supplier_invoices (
                    supplier_name,
                    invoice_number,
                    invoice_date,
                    currency,
                    total_raw_cost,
                    total_shipping_transport_cost,
                    total_customs_duties_cost,
                    total_overhead_cost,
                    total_landed_cost,
                    notes
                ) VALUES (
                    :supplier_name,
                    :invoice_number,
                    :invoice_date,
                    :currency,
                    :total_raw_cost,
                    :total_shipping,
                    :total_customs,
                    :total_overhead,
                    :total_landed,
                    :notes
                ) RETURNING id';

        $stmt = $this->pdo->prepare($sql);
        $stmt->bindValue(':supplier_name', $invoice['supplier_name'], PDO::PARAM_STR);
        $stmt->bindValue(':invoice_number', $invoice['invoice_number'], $invoice['invoice_number'] === null ? PDO::PARAM_NULL : PDO::PARAM_STR);
        $stmt->bindValue(':invoice_date', $invoice['invoice_date'], PDO::PARAM_STR);
        $stmt->bindValue(':currency', $invoice['currency'], PDO::PARAM_STR);
        $stmt->bindValue(':total_raw_cost', $this->decimal($totalRawCost), PDO::PARAM_STR);
        $stmt->bindValue(':total_shipping', $this->decimal($invoice['total_shipping_transport_cost']), PDO::PARAM_STR);
        $stmt->bindValue(':total_customs', $this->decimal($invoice['total_customs_duties_cost']), PDO::PARAM_STR);
        $stmt->bindValue(':total_overhead', $this->decimal($allocationOverhead), PDO::PARAM_STR);
        $stmt->bindValue(':total_landed', $this->decimal($totalLandedCost), PDO::PARAM_STR);
        $stmt->bindValue(':notes', $invoice['notes'], $invoice['notes'] === null ? PDO::PARAM_NULL : PDO::PARAM_STR);
        $stmt->execute();

        $invoiceId = $stmt->fetchColumn();
        if ($invoiceId === false || $invoiceId === null) {
            throw new RuntimeException('supplier_invoices insert did not return an invoice_id.');
        }

        return (int) $invoiceId;
    }

    /**
     * Create the FIFO stock batch. quantity_remaining = quantity_received so
     * the FIFO engine can immediately draw from it.
     *
     * @param array<string,mixed> $line
     */
    private function insertInventoryBatch(array $line): void
    {
        $sql = 'INSERT INTO public.inventory_batches (
                    product_id,
                    supplier_unit_price,
                    shipping_cost_allocated,
                    landed_unit_cost,
                    quantity_received,
                    quantity_remaining
                ) VALUES (
                    :product_id,
                    :supplier_unit_price,
                    :shipping_cost_allocated,
                    :landed_unit_cost,
                    :quantity_received,
                    :quantity_remaining
                )';

        $stmt = $this->pdo->prepare($sql);
        $stmt->bindValue(':product_id', $line['product_id'], PDO::PARAM_STR);
        $stmt->bindValue(':supplier_unit_price', $this->decimal($line['supplier_unit_price']), PDO::PARAM_STR);
        $stmt->bindValue(':shipping_cost_allocated', $this->decimal($line['allocated_overhead_share']), PDO::PARAM_STR);
        $stmt->bindValue(':landed_unit_cost', $this->decimal($line['landed_unit_cost']), PDO::PARAM_STR);
        $stmt->bindValue(':quantity_received', $line['quantity'], PDO::PARAM_INT);
        $stmt->bindValue(':quantity_remaining', $line['quantity'], PDO::PARAM_INT);
        $stmt->execute();
    }

    /**
     * Increment the baseline total units on the product. Keeps both the catalog
     * column (stock_quantity) and the FIFO column (current_stock) in sync.
     */
    private function incrementProductStock(string $productId, int $quantity): void
    {
        $sql = 'UPDATE public.products
                   SET stock_quantity = COALESCE(stock_quantity, 0) + :qty_catalog,
                       current_stock  = COALESCE(current_stock, 0) + :qty_fifo,
                       updated_at     = CURRENT_TIMESTAMP
                 WHERE id = :product_id';

        $stmt = $this->pdo->prepare($sql);
        $stmt->bindValue(':qty_catalog', $quantity, PDO::PARAM_INT);
        $stmt->bindValue(':qty_fifo', $quantity, PDO::PARAM_INT);
        $stmt->bindValue(':product_id', $productId, PDO::PARAM_STR);
        $stmt->execute();

        if ($stmt->rowCount() < 1) {
            throw new RuntimeException(
                sprintf('Product "%s" was not found; cannot update stock.', $productId)
            );
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // Input normalization / validation
    // ─────────────────────────────────────────────────────────────────────

    /**
     * @param array<string,mixed> $invoiceData
     *
     * @return array{
     *     supplier_name:string,
     *     invoice_number:?string,
     *     invoice_date:string,
     *     currency:string,
     *     total_shipping_transport_cost:float,
     *     total_customs_duties_cost:float,
     *     notes:?string
     * }
     */
    private function normalizeInvoice(array $invoiceData): array
    {
        $supplierName = trim((string) ($invoiceData['supplier_name'] ?? ''));
        if ($supplierName === '') {
            throw new InvalidArgumentException('invoiceData.supplier_name is required.');
        }

        $invoiceNumber = isset($invoiceData['invoice_number']) && trim((string) $invoiceData['invoice_number']) !== ''
            ? trim((string) $invoiceData['invoice_number'])
            : null;

        $invoiceDate = isset($invoiceData['invoice_date']) && trim((string) $invoiceData['invoice_date']) !== ''
            ? trim((string) $invoiceData['invoice_date'])
            : date('Y-m-d');

        $currency = isset($invoiceData['currency']) && trim((string) $invoiceData['currency']) !== ''
            ? strtoupper(trim((string) $invoiceData['currency']))
            : 'LYD';

        $notes = isset($invoiceData['notes']) && trim((string) $invoiceData['notes']) !== ''
            ? trim((string) $invoiceData['notes'])
            : null;

        return [
            'supplier_name'                 => $supplierName,
            'invoice_number'                => $invoiceNumber,
            'invoice_date'                  => $invoiceDate,
            'currency'                      => $currency,
            'total_shipping_transport_cost' => $this->nonNegativeFloat(
                $invoiceData['total_shipping_transport_cost'] ?? 0,
                'total_shipping_transport_cost'
            ),
            'total_customs_duties_cost'     => $this->nonNegativeFloat(
                $invoiceData['total_customs_duties_cost'] ?? 0,
                'total_customs_duties_cost'
            ),
            'notes'                         => $notes,
        ];
    }

    /**
     * @param array<int,array<string,mixed>> $productsList
     *
     * @return array<int,array{
     *     product_id:string,
     *     supplier_unit_price:float,
     *     quantity:int,
     *     raw_line_cost:float
     * }>
     */
    private function normalizeProducts(array $productsList): array
    {
        $normalized = [];

        foreach (array_values($productsList) as $position => $raw) {
            if (!is_array($raw)) {
                throw new InvalidArgumentException(
                    sprintf('Product line #%d must be an array.', $position + 1)
                );
            }

            $productId = trim((string) ($raw['product_id'] ?? ''));
            if (!$this->isUuid($productId)) {
                throw new InvalidArgumentException(
                    sprintf('Product line #%d has an invalid product_id (expected UUID).', $position + 1)
                );
            }

            $unitPrice = $this->nonNegativeFloat(
                $raw['supplier_unit_price'] ?? null,
                sprintf('product line #%d supplier_unit_price', $position + 1)
            );

            // Accept quantity | quantity_received | quantity_ordered.
            $quantity = (int) ($raw['quantity'] ?? $raw['quantity_received'] ?? $raw['quantity_ordered'] ?? 0);
            if ($quantity <= 0) {
                throw new InvalidArgumentException(
                    sprintf('Product line #%d quantity must be a positive integer.', $position + 1)
                );
            }

            $normalized[] = [
                'product_id'          => $productId,
                'supplier_unit_price' => $unitPrice,
                'quantity'            => $quantity,
                'raw_line_cost'       => $this->money($unitPrice * $quantity),
            ];
        }

        return $normalized;
    }

    // ─────────────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────────────

    /** Round a monetary value to the storage scale. */
    private function money(float $value): float
    {
        return round($value, self::MONEY_SCALE);
    }

    /** Format a float as a fixed-scale decimal string for safe DECIMAL binding. */
    private function decimal(float $value): string
    {
        return number_format($value, self::MONEY_SCALE, '.', '');
    }

    private function nonNegativeFloat(mixed $value, string $label): float
    {
        if ($value === null || $value === '') {
            return 0.0;
        }
        if (!is_numeric($value)) {
            throw new InvalidArgumentException(sprintf('%s must be numeric.', $label));
        }

        $float = (float) $value;
        if ($float < 0.0) {
            throw new InvalidArgumentException(sprintf('%s cannot be negative.', $label));
        }

        return $float;
    }

    private function isUuid(string $value): bool
    {
        return (bool) preg_match(
            '/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i',
            $value
        );
    }
}
