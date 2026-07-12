<?php

declare(strict_types=1);

namespace Shamaadan\Purchasing;

use InvalidArgumentException;
use PDO;
use RuntimeException;
use Throwable;

/**
 * Foreign Purchase Invoice / Landed Cost engine for Shamaadan E-Store.
 *
 * Takes a supplier invoice (raw goods cost) plus its shipping/transport and
 * customs overhead, pro-rata-allocates that overhead across the line items by
 * value weight, and persists everything atomically:
 *
 *   supplier_invoices        — invoice header + cost totals
 *   supplier_invoice_items   — per-line raw/allocated/landed costs
 *   inventory_batches        — a new FIFO batch per line (quantity_remaining = ordered)
 *   products                 — running stock incremented
 *
 * Requires (run once in Supabase SQL Editor):
 *   sql/accounting_fifo.sql      (inventory_batches, products.current_stock)
 *   sql/supplier_invoices.sql    (supplier_invoices, supplier_invoice_items)
 *
 * Usage:
 *   $pdo = new PDO($dsn, $user, $pass);
 *   $manager = new PurchaseInvoiceManager($pdo);
 *   try {
 *       $manager->processSupplierInvoice($header, $lines);
 *   } catch (Throwable $e) {
 *       // handle / log — nothing was committed
 *   }
 */
final class PurchaseInvoiceManager
{
    /** Monetary scale for DECIMAL(14,4) columns. */
    private const MONEY_SCALE = 4;

    private PDO $pdo;

    public function __construct(PDO $pdo)
    {
        $this->pdo = $pdo;
        // Guarantee statement failures throw so the transaction can roll back.
        $this->pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $this->pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    }

    /**
     * Process a supplier invoice end-to-end inside a single DB transaction.
     *
     * @param array<string,mixed>              $invoiceHeader Header fields (see normalizeHeader()).
     * @param array<int,array<string,mixed>>   $lineItems     Raw line items (see normalizeLineItems()).
     *
     * @return bool True on success. On any failure the transaction is rolled
     *              back and a RuntimeException (or InvalidArgumentException for
     *              bad input) is thrown with a clear message.
     *
     * @throws InvalidArgumentException When input is missing/invalid.
     * @throws RuntimeException         When persistence fails.
     */
    public function processSupplierInvoice(array $invoiceHeader, array $lineItems): bool
    {
        // ── 1. Validate & normalize input ────────────────────────────────
        if ($lineItems === []) {
            throw new InvalidArgumentException('Invoice must contain at least one line item.');
        }

        $header = $this->normalizeHeader($invoiceHeader);
        $items = $this->normalizeLineItems($lineItems);

        // ── 2. Totals: raw goods cost + overhead to distribute ───────────
        $totalRawCost = 0.0;
        foreach ($items as $item) {
            $totalRawCost += $item['raw_line_cost'];
        }
        $totalRawCost = $this->money($totalRawCost);

        if ($totalRawCost <= 0.0) {
            throw new InvalidArgumentException(
                'Total raw items cost must be greater than zero to allocate overhead.'
            );
        }

        $totalOverhead = $this->money(
            $header['total_shipping_transport_cost'] + $header['total_customs_duties_cost']
        );

        // ── 3. Pro-rata allocation loop ──────────────────────────────────
        // Allocate by value weight. The final line absorbs the rounding
        // remainder so the sum of allocations equals total overhead exactly.
        $processed = [];
        $allocatedSoFar = 0.0;
        $lastIndex = count($items) - 1;

        foreach ($items as $index => $item) {
            if ($index === $lastIndex) {
                $allocatedOverhead = $this->money($totalOverhead - $allocatedSoFar);
            } else {
                $weight = $item['raw_line_cost'] / $totalRawCost;
                $allocatedOverhead = $this->money($totalOverhead * $weight);
                $allocatedSoFar += $allocatedOverhead;
            }

            if ($allocatedOverhead < 0.0) {
                $allocatedOverhead = 0.0; // guard against negative rounding drift
            }

            $finalLandedUnitCost = $this->money(
                $item['supplier_unit_price'] + ($allocatedOverhead / $item['quantity_ordered'])
            );

            $processed[] = $item + [
                'allocated_overhead'     => $allocatedOverhead,
                'final_landed_unit_cost' => $finalLandedUnitCost,
            ];
        }

        $totalLandedCost = 0.0;
        foreach ($processed as $item) {
            $totalLandedCost += $item['final_landed_unit_cost'] * $item['quantity_ordered'];
        }
        $totalLandedCost = $this->money($totalLandedCost);

        // ── 4/5. Persist atomically ──────────────────────────────────────
        $this->pdo->beginTransaction();
        try {
            $invoiceId = $this->insertInvoiceHeader(
                $header,
                $totalRawCost,
                $totalOverhead,
                $totalLandedCost
            );

            foreach ($processed as $item) {
                $this->insertInvoiceItem($invoiceId, $item);
                $this->insertInventoryBatch($item);
                $this->incrementProductStock($item['product_id'], $item['quantity_ordered']);
            }

            $this->pdo->commit();

            return true;
        } catch (Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw new RuntimeException(
                'Failed to process supplier invoice; transaction rolled back: ' . $e->getMessage(),
                0,
                $e
            );
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // Persistence
    // ─────────────────────────────────────────────────────────────────────

    /**
     * @param array<string,mixed> $header
     */
    private function insertInvoiceHeader(
        array $header,
        float $totalRawCost,
        float $totalOverhead,
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
        $stmt->bindValue(':supplier_name', $header['supplier_name'], PDO::PARAM_STR);
        $stmt->bindValue(':invoice_number', $header['invoice_number'], $header['invoice_number'] === null ? PDO::PARAM_NULL : PDO::PARAM_STR);
        $stmt->bindValue(':invoice_date', $header['invoice_date'], PDO::PARAM_STR);
        $stmt->bindValue(':currency', $header['currency'], PDO::PARAM_STR);
        $stmt->bindValue(':total_raw_cost', $this->decimal($totalRawCost), PDO::PARAM_STR);
        $stmt->bindValue(':total_shipping', $this->decimal($header['total_shipping_transport_cost']), PDO::PARAM_STR);
        $stmt->bindValue(':total_customs', $this->decimal($header['total_customs_duties_cost']), PDO::PARAM_STR);
        $stmt->bindValue(':total_overhead', $this->decimal($totalOverhead), PDO::PARAM_STR);
        $stmt->bindValue(':total_landed', $this->decimal($totalLandedCost), PDO::PARAM_STR);
        $stmt->bindValue(':notes', $header['notes'], $header['notes'] === null ? PDO::PARAM_NULL : PDO::PARAM_STR);
        $stmt->execute();

        $invoiceId = $stmt->fetchColumn();
        if ($invoiceId === false || $invoiceId === null) {
            throw new RuntimeException('Insert into supplier_invoices did not return an id.');
        }

        return (int) $invoiceId;
    }

    /**
     * @param array<string,mixed> $item
     */
    private function insertInvoiceItem(int $invoiceId, array $item): void
    {
        $sql = 'INSERT INTO public.supplier_invoice_items (
                    invoice_id,
                    product_id,
                    supplier_unit_price,
                    quantity_ordered,
                    raw_line_cost,
                    allocated_overhead,
                    final_landed_unit_cost
                ) VALUES (
                    :invoice_id,
                    :product_id,
                    :supplier_unit_price,
                    :quantity_ordered,
                    :raw_line_cost,
                    :allocated_overhead,
                    :final_landed_unit_cost
                )';

        $stmt = $this->pdo->prepare($sql);
        $stmt->bindValue(':invoice_id', $invoiceId, PDO::PARAM_INT);
        $stmt->bindValue(':product_id', $item['product_id'], PDO::PARAM_STR);
        $stmt->bindValue(':supplier_unit_price', $this->decimal($item['supplier_unit_price']), PDO::PARAM_STR);
        $stmt->bindValue(':quantity_ordered', $item['quantity_ordered'], PDO::PARAM_INT);
        $stmt->bindValue(':raw_line_cost', $this->decimal($item['raw_line_cost']), PDO::PARAM_STR);
        $stmt->bindValue(':allocated_overhead', $this->decimal($item['allocated_overhead']), PDO::PARAM_STR);
        $stmt->bindValue(':final_landed_unit_cost', $this->decimal($item['final_landed_unit_cost']), PDO::PARAM_STR);
        $stmt->execute();
    }

    /**
     * Create the FIFO stock batch. quantity_remaining = quantity_received so the
     * FIFO engine can immediately draw from it.
     *
     * @param array<string,mixed> $item
     */
    private function insertInventoryBatch(array $item): void
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
        $stmt->bindValue(':product_id', $item['product_id'], PDO::PARAM_STR);
        $stmt->bindValue(':supplier_unit_price', $this->decimal($item['supplier_unit_price']), PDO::PARAM_STR);
        $stmt->bindValue(':shipping_cost_allocated', $this->decimal($item['allocated_overhead']), PDO::PARAM_STR);
        $stmt->bindValue(':landed_unit_cost', $this->decimal($item['final_landed_unit_cost']), PDO::PARAM_STR);
        $stmt->bindValue(':quantity_received', $item['quantity_ordered'], PDO::PARAM_INT);
        $stmt->bindValue(':quantity_remaining', $item['quantity_ordered'], PDO::PARAM_INT);
        $stmt->execute();
    }

    /**
     * Increment running stock on the catalog product. Keeps both the catalog
     * column (stock_quantity) and the FIFO column (current_stock) in sync.
     */
    private function incrementProductStock(string $productId, int $quantity): void
    {
        $sql = 'UPDATE public.products
                   SET stock_quantity = COALESCE(stock_quantity, 0) + :qty1,
                       current_stock  = COALESCE(current_stock, 0) + :qty2,
                       updated_at     = CURRENT_TIMESTAMP
                 WHERE id = :product_id';

        $stmt = $this->pdo->prepare($sql);
        $stmt->bindValue(':qty1', $quantity, PDO::PARAM_INT);
        $stmt->bindValue(':qty2', $quantity, PDO::PARAM_INT);
        $stmt->bindValue(':product_id', $productId, PDO::PARAM_STR);
        $stmt->execute();

        if ($stmt->rowCount() < 1) {
            throw new RuntimeException(
                sprintf('Product "%s" was not found; cannot increment stock.', $productId)
            );
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // Input normalization / validation
    // ─────────────────────────────────────────────────────────────────────

    /**
     * @param array<string,mixed> $header
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
    private function normalizeHeader(array $header): array
    {
        $supplierName = trim((string) ($header['supplier_name'] ?? ''));
        if ($supplierName === '') {
            throw new InvalidArgumentException('invoiceHeader.supplier_name is required.');
        }

        $invoiceNumber = isset($header['invoice_number']) && trim((string) $header['invoice_number']) !== ''
            ? trim((string) $header['invoice_number'])
            : null;

        $invoiceDate = isset($header['invoice_date']) && trim((string) $header['invoice_date']) !== ''
            ? trim((string) $header['invoice_date'])
            : date('Y-m-d');

        $currency = isset($header['currency']) && trim((string) $header['currency']) !== ''
            ? strtoupper(trim((string) $header['currency']))
            : 'LYD';

        $notes = isset($header['notes']) && trim((string) $header['notes']) !== ''
            ? trim((string) $header['notes'])
            : null;

        return [
            'supplier_name'                 => $supplierName,
            'invoice_number'                => $invoiceNumber,
            'invoice_date'                  => $invoiceDate,
            'currency'                      => $currency,
            'total_shipping_transport_cost' => $this->nonNegativeFloat(
                $header['total_shipping_transport_cost'] ?? 0,
                'total_shipping_transport_cost'
            ),
            'total_customs_duties_cost'     => $this->nonNegativeFloat(
                $header['total_customs_duties_cost'] ?? 0,
                'total_customs_duties_cost'
            ),
            'notes'                         => $notes,
        ];
    }

    /**
     * @param array<int,array<string,mixed>> $lineItems
     *
     * @return array<int,array{
     *     product_id:string,
     *     supplier_unit_price:float,
     *     quantity_ordered:int,
     *     raw_line_cost:float
     * }>
     */
    private function normalizeLineItems(array $lineItems): array
    {
        $normalized = [];

        foreach (array_values($lineItems) as $position => $raw) {
            if (!is_array($raw)) {
                throw new InvalidArgumentException(
                    sprintf('Line item #%d must be an array.', $position + 1)
                );
            }

            $productId = trim((string) ($raw['product_id'] ?? ''));
            if (!$this->isUuid($productId)) {
                throw new InvalidArgumentException(
                    sprintf('Line item #%d has an invalid product_id (expected UUID).', $position + 1)
                );
            }

            $unitPrice = $this->nonNegativeFloat(
                $raw['supplier_unit_price'] ?? null,
                sprintf('line item #%d supplier_unit_price', $position + 1)
            );

            $quantity = (int) ($raw['quantity_ordered'] ?? 0);
            if ($quantity <= 0) {
                throw new InvalidArgumentException(
                    sprintf('Line item #%d quantity_ordered must be a positive integer.', $position + 1)
                );
            }

            $normalized[] = [
                'product_id'          => $productId,
                'supplier_unit_price' => $unitPrice,
                'quantity_ordered'    => $quantity,
                'raw_line_cost'       => $this->money($unitPrice * $quantity),
            ];
        }

        return $normalized;
    }

    // ─────────────────────────────────────────────────────────────────────
    // Small helpers
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
        if ($value === null || $value === '' || !is_numeric($value)) {
            if ($value === null || $value === '') {
                return 0.0;
            }
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
