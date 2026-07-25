-- ============================================================================
-- reset_data.sql — Full clean slate for Shamaadan E-Store
-- ----------------------------------------------------------------------------
-- Wipes ALL business / test data:
--   products, categories, collections, stock batches, sales, orders,
--   purchases, waste, expenses, push subscriptions, invoice counters
--
-- KEEPS login accounts (users, auth_sessions) so you can still sign in.
--
-- ⚠️  THIS IS IRREVERSIBLE. Run only if you want a clean database.
--
-- How to run:
--   1. Open Supabase Dashboard → SQL Editor → New query
--   2. Paste this entire file
--   3. Click Run
-- ============================================================================

DO $$
DECLARE
  t          text;
  existing   text[] := ARRAY[]::text[];
  candidates text[] := ARRAY[
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
    'collections',
    'push_subscriptions',
    'invoice_counters'
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
