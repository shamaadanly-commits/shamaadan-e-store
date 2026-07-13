-- ============================================================================
-- reset_data.sql — Full clean slate for Shamaadan E-Store
-- ----------------------------------------------------------------------------
-- Wipes ALL business data (products, stock, sales, purchases, taxonomy) and
-- resets identity/serial counters back to 1.
--
-- KEEPS your login accounts (users, auth_sessions) so you can still sign in.
--
-- ⚠️  THIS IS IRREVERSIBLE. Take a Supabase backup / snapshot first if unsure.
--
-- Run in: Supabase → SQL Editor → paste → Run.
-- ============================================================================

DO $$
DECLARE
  -- Order does not matter because we TRUNCATE all together with CASCADE.
  -- Only tables that actually exist are included, so partial installs are fine.
  t            text;
  existing     text[] := ARRAY[]::text[];
  candidates   text[] := ARRAY[
    'inventory_transactions',
    'supplier_invoice_items',
    'supplier_invoices',
    'inventory_batches',
    'sales_items',
    'inventory_waste',
    'operating_expenses',
    'order_items',
    'orders',
    'products',
    'categories',
    'collections'
  ];
BEGIN
  FOREACH t IN ARRAY candidates LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      existing := array_append(existing, 'public.' || quote_ident(t));
    END IF;
  END LOOP;

  IF array_length(existing, 1) IS NULL THEN
    RAISE NOTICE 'No matching tables found — nothing to reset.';
  ELSE
    EXECUTE 'TRUNCATE TABLE '
      || array_to_string(existing, ', ')
      || ' RESTART IDENTITY CASCADE';
    RAISE NOTICE 'Reset complete. Cleared: %', array_to_string(existing, ', ');
  END IF;
END $$;
