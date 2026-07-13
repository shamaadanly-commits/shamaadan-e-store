<?php

declare(strict_types=1);

/**
 * Supplier invoice / landed-cost entry page.
 *
 * A self-contained admin page (host this on your PHP server) where you type a
 * foreign purchase invoice — supplier, shipping/transport cost, customs/duties,
 * and product lines — then Save to run the LandedCostEngine, which allocates the
 * overhead pro-rata, creates FIFO inventory batches, and updates product stock.
 *
 * Protect it with INTAKE_PASSWORD in .env.
 */

require_once dirname(__DIR__) . '/db.php';
require_once dirname(__DIR__) . '/LandedCostEngine.php';

use Shamaadan\Purchasing\LandedCostEngine;

session_start();
loadDotEnv(dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . '.env');

/* ── Password gate ─────────────────────────────────────────────────── */
$requiredPassword = envValue('INTAKE_PASSWORD');
$authError = '';

if ($requiredPassword !== null) {
    if (($_POST['__action'] ?? '') === 'login') {
        if (hash_equals($requiredPassword, (string) ($_POST['password'] ?? ''))) {
            $_SESSION['invoice_authed'] = true;
        } else {
            $authError = 'Incorrect password.';
        }
    }
    if (($_GET['logout'] ?? '') === '1') {
        unset($_SESSION['invoice_authed']);
    }
}

$isAuthed = $requiredPassword === null || !empty($_SESSION['invoice_authed']);

/* ── Handle invoice submission ─────────────────────────────────────── */
$flash = null; // ['type' => 'ok'|'error', 'message' => string]
$submitted = [];

if ($isAuthed && ($_POST['__action'] ?? '') === 'save_invoice') {
    $invoiceData = [
        'supplier_name'                 => trim((string) ($_POST['supplier_name'] ?? '')),
        'invoice_number'                => trim((string) ($_POST['invoice_number'] ?? '')),
        'invoice_date'                  => trim((string) ($_POST['invoice_date'] ?? '')),
        'currency'                      => trim((string) ($_POST['currency'] ?? 'LYD')),
        'total_shipping_transport_cost' => $_POST['total_shipping_transport_cost'] ?? 0,
        'total_customs_duties_cost'     => $_POST['total_customs_duties_cost'] ?? 0,
        'notes'                         => trim((string) ($_POST['notes'] ?? '')),
    ];

    $productIds = (array) ($_POST['product_id'] ?? []);
    $unitPrices = (array) ($_POST['supplier_unit_price'] ?? []);
    $quantities = (array) ($_POST['quantity'] ?? []);

    $productsList = [];
    foreach ($productIds as $i => $pid) {
        $pid = trim((string) $pid);
        if ($pid === '') {
            continue; // skip empty rows
        }
        $productsList[] = [
            'product_id'          => $pid,
            'supplier_unit_price' => $unitPrices[$i] ?? 0,
            'quantity'            => $quantities[$i] ?? 0,
        ];
    }

    $submitted = $invoiceData + ['lines' => $productsList];

    try {
        $engine = new LandedCostEngine(createSupabasePdo());
        $engine->intakeSupplierInvoice($invoiceData, $productsList);
        $flash = ['type' => 'ok', 'message' => 'Invoice recorded. Landed costs allocated, inventory batches created, and product stock updated.'];
        $submitted = []; // clear form on success
    } catch (Throwable $e) {
        $flash = ['type' => 'error', 'message' => $e->getMessage()];
    }
}

/* ── Load product options for the line dropdowns ───────────────────── */
$products = [];
$productsError = '';
if ($isAuthed) {
    try {
        $pdo = createSupabasePdo();
        $stmt = $pdo->query(
            'SELECT id, name, COALESCE(barcode, \'\') AS barcode
               FROM public.products
              WHERE is_active IS NOT FALSE
              ORDER BY name ASC'
        );
        $products = $stmt->fetchAll();
    } catch (Throwable $e) {
        $productsError = $e->getMessage();
    }
}

function h(mixed $value): string
{
    return htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8');
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Supplier Invoice — Landed Cost Intake</title>
<style>
  :root { --bg:#0f0e0c; --surface:#1a1814; --surface2:#232018; --border:rgb(235 230 220 / 12%); --text:#e8e3d9; --muted:#9a9286; --gold:#c9a84c; --ok:#3f9e6a; --err:#c45c5c; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif; line-height:1.5; }
  .wrap { max-width:900px; margin:0 auto; padding:1.5rem 1rem 4rem; }
  h1 { font-weight:500; font-size:1.4rem; margin:0 0 0.25rem; }
  .sub { color:var(--muted); font-size:0.85rem; margin:0 0 1.5rem; }
  .card { background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:1.25rem; margin-bottom:1.25rem; }
  label { display:block; font-size:0.72rem; text-transform:uppercase; letter-spacing:0.06em; color:var(--muted); font-weight:600; margin-bottom:0.35rem; }
  input, select, textarea { width:100%; padding:0.6rem 0.7rem; font-size:16px; background:var(--surface2); border:1px solid var(--border); border-radius:8px; color:var(--text); }
  input:focus, select:focus, textarea:focus { outline:none; border-color:var(--gold); }
  .grid { display:grid; grid-template-columns:1fr 1fr; gap:0.85rem; }
  .field { margin-bottom:0.85rem; }
  .lines { width:100%; border-collapse:collapse; }
  .lines th { text-align:left; font-size:0.7rem; text-transform:uppercase; color:var(--muted); padding:0 0.4rem 0.5rem; }
  .lines td { padding:0.25rem 0.4rem; vertical-align:top; }
  .btn { display:inline-flex; align-items:center; justify-content:center; gap:0.4rem; padding:0.7rem 1.1rem; min-height:44px; font-weight:700; font-size:0.85rem; border-radius:8px; border:1px solid var(--border); background:var(--surface2); color:var(--text); cursor:pointer; }
  .btn--primary { background:linear-gradient(135deg,var(--gold),#a8842f); color:#16130f; border:none; }
  .btn--ghost { background:transparent; }
  .btn--sm { min-height:auto; padding:0.5rem 0.7rem; font-size:0.8rem; }
  .flash { padding:0.85rem 1rem; border-radius:8px; margin-bottom:1.25rem; font-size:0.9rem; }
  .flash--ok { background:rgb(63 158 106 / 15%); border:1px solid var(--ok); }
  .flash--error { background:rgb(196 92 92 / 15%); border:1px solid var(--err); }
  .row-actions { margin-top:0.75rem; display:flex; gap:0.6rem; flex-wrap:wrap; }
  .topbar { display:flex; justify-content:space-between; align-items:center; gap:1rem; margin-bottom:1.25rem; flex-wrap:wrap; }
  a { color:var(--gold); }
  @media (max-width:600px){ .grid{ grid-template-columns:1fr; } }
</style>
</head>
<body>
<div class="wrap">

<?php if (!$isAuthed): ?>
  <div class="topbar"><h1>Supplier Invoice</h1></div>
  <form class="card" method="post" style="max-width:360px;margin:2rem auto;">
    <input type="hidden" name="__action" value="login">
    <div class="field">
      <label for="password">Password</label>
      <input id="password" name="password" type="password" autocomplete="current-password" required autofocus>
    </div>
    <?php if ($authError): ?><p class="flash flash--error"><?= h($authError) ?></p><?php endif; ?>
    <button class="btn btn--primary" type="submit" style="width:100%;">Sign in</button>
  </form>
<?php else: ?>

  <div class="topbar">
    <div>
      <h1>Supplier Invoice — Landed Cost Intake</h1>
      <p class="sub">Enter shipping &amp; customs once; costs are allocated across items automatically.</p>
    </div>
    <?php if ($requiredPassword !== null): ?><a class="btn btn--ghost btn--sm" href="?logout=1">Log out</a><?php endif; ?>
  </div>

  <?php if ($flash): ?>
    <div class="flash flash--<?= h($flash['type']) ?>"><?= h($flash['message']) ?></div>
  <?php endif; ?>

  <?php if ($productsError): ?>
    <div class="flash flash--error">Could not load products: <?= h($productsError) ?></div>
  <?php endif; ?>

  <form method="post">
    <input type="hidden" name="__action" value="save_invoice">

    <div class="card">
      <div class="grid">
        <div class="field">
          <label for="supplier_name">Supplier name *</label>
          <input id="supplier_name" name="supplier_name" required value="<?= h($submitted['supplier_name'] ?? '') ?>" placeholder="Guangzhou Aroma Co.">
        </div>
        <div class="field">
          <label for="invoice_number">Invoice number</label>
          <input id="invoice_number" name="invoice_number" value="<?= h($submitted['invoice_number'] ?? '') ?>" placeholder="GZ-2026-0442">
        </div>
        <div class="field">
          <label for="invoice_date">Invoice date</label>
          <input id="invoice_date" name="invoice_date" type="date" value="<?= h($submitted['invoice_date'] ?? date('Y-m-d')) ?>">
        </div>
        <div class="field">
          <label for="currency">Currency</label>
          <input id="currency" name="currency" value="<?= h($submitted['currency'] ?? 'LYD') ?>" placeholder="USD">
        </div>
        <div class="field">
          <label for="ship">Total shipping / transport cost</label>
          <input id="ship" name="total_shipping_transport_cost" type="number" min="0" step="0.01" value="<?= h($submitted['total_shipping_transport_cost'] ?? '') ?>" placeholder="1200.00">
        </div>
        <div class="field">
          <label for="customs">Total customs / duties cost</label>
          <input id="customs" name="total_customs_duties_cost" type="number" min="0" step="0.01" value="<?= h($submitted['total_customs_duties_cost'] ?? '') ?>" placeholder="800.00">
        </div>
      </div>
      <div class="field">
        <label for="notes">Notes</label>
        <textarea id="notes" name="notes" rows="2" placeholder="Optional"><?= h($submitted['notes'] ?? '') ?></textarea>
      </div>
    </div>

    <div class="card">
      <label style="margin-bottom:0.75rem;">Product lines</label>
      <table class="lines">
        <thead>
          <tr>
            <th style="width:50%;">Product</th>
            <th>Supplier unit price</th>
            <th>Quantity</th>
            <th></th>
          </tr>
        </thead>
        <tbody id="lines-body">
          <!-- rows injected by JS; template below -->
        </tbody>
      </table>
      <div class="row-actions">
        <button type="button" class="btn btn--ghost btn--sm" id="add-line">+ Add line</button>
      </div>
    </div>

    <button type="submit" class="btn btn--primary">Save invoice &amp; update stock</button>
  </form>

  <template id="line-template">
    <tr>
      <td>
        <select name="product_id[]">
          <option value="">Select product…</option>
          <?php foreach ($products as $p): ?>
            <option value="<?= h($p['id']) ?>"><?= h($p['name']) ?><?= $p['barcode'] !== '' ? ' · ' . h($p['barcode']) : '' ?></option>
          <?php endforeach; ?>
        </select>
      </td>
      <td><input name="supplier_unit_price[]" type="number" min="0" step="0.0001" placeholder="5.00"></td>
      <td><input name="quantity[]" type="number" min="1" step="1" placeholder="100"></td>
      <td><button type="button" class="btn btn--ghost btn--sm remove-line" title="Remove">✕</button></td>
    </tr>
  </template>

  <script>
    const body = document.getElementById('lines-body');
    const tpl = document.getElementById('line-template');

    function addLine() {
      body.appendChild(tpl.content.cloneNode(true));
    }

    document.getElementById('add-line').addEventListener('click', addLine);
    body.addEventListener('click', (e) => {
      if (e.target.closest('.remove-line')) {
        const rows = body.querySelectorAll('tr');
        if (rows.length > 1) e.target.closest('tr').remove();
      }
    });

    // Start with three empty lines.
    addLine(); addLine(); addLine();
  </script>

<?php endif; ?>

</div>
</body>
</html>
