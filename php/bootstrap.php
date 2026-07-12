<?php

declare(strict_types=1);

/**
 * PDO bootstrap for AccountingManager.
 *
 * Configure via environment:
 *   DB_DSN=mysql:host=127.0.0.1;dbname=shamaadan;charset=utf8mb4
 *   DB_USER=root
 *   DB_PASS=secret
 */

require_once __DIR__ . '/AccountingManager.php';

function createAccountingPdo(): PDO
{
    $dsn = getenv('DB_DSN') ?: 'mysql:host=127.0.0.1;dbname=shamaadan;charset=utf8mb4';
    $user = getenv('DB_USER') ?: 'root';
    $pass = getenv('DB_PASS') !== false ? (string) getenv('DB_PASS') : '';

    $pdo = new PDO($dsn, $user, $pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);

    return $pdo;
}

// Example usage (CLI): php php/bootstrap.php
if (PHP_SAPI === 'cli' && realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
    $manager = new AccountingManager(createAccountingPdo());

    // Receive stock with allocated shipping already computed for this line
    $batch = $manager->addInventoryBatch(
        productId: 1,
        qty: 100,
        supplierPrice: 10.00,
        allocatedShipping: 50.00, // => landed 10.50
    );
    print_r($batch);

    // Or allocate a global shipment across multiple SKUs (pro-rata by cost)
    $purchase = $manager->addPurchaseWithLandedCosts(
        lines: [
            ['product_id' => 1, 'qty' => 50, 'supplier_unit_price' => 10.0],
            ['product_id' => 2, 'qty' => 20, 'supplier_unit_price' => 25.0],
        ],
        globalShipping: 120.0,
    );
    print_r($purchase);

    $sale = $manager->processSale(productId: 1, qty: 3, sellingPrice: 48.0);
    print_r($sale);

    $waste = $manager->logWaste(productId: 1, qty: 1, reason: 'Broken on arrival');
    print_r($waste);

    $report = $manager->getDailyFinancialReport(date('Y-m-d'));
    print_r($report);
}
