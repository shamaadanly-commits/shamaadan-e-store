-- Shamaadan — RLS policies for public.inventory_transactions
--
-- Fixes: "new row violates row-level security policy for table
-- inventory_transactions" when voiding/restoring a parked ticket.
--
-- The existing INSERT policy in the database only permits a fixed set of
-- `type` values (e.g. 'sale', 'park', 'restock') and rejects 'park_void'.
-- Postgres combines PERMISSIVE policies with OR, so adding an
-- always-true INSERT policy unblocks every transaction type the app writes
-- (sale, park, park_void, restock, ...), matching how the other tables in
-- this project are configured (see catalog_schema.sql / open_tickets.sql).

alter table public.inventory_transactions enable row level security;

drop policy if exists "inventory_transactions_select_all" on public.inventory_transactions;
drop policy if exists "inventory_transactions_insert_all" on public.inventory_transactions;
drop policy if exists "inventory_transactions_update_all" on public.inventory_transactions;
drop policy if exists "inventory_transactions_delete_all" on public.inventory_transactions;

create policy "inventory_transactions_select_all" on public.inventory_transactions for select using (true);
create policy "inventory_transactions_insert_all" on public.inventory_transactions for insert with check (true);
create policy "inventory_transactions_update_all" on public.inventory_transactions for update using (true) with check (true);
create policy "inventory_transactions_delete_all" on public.inventory_transactions for delete using (true);

-- ── Allowed transaction types ────────────────────────────────────────
-- Keep this list in sync with the values the app writes:
--   'sale'       — completed in-store / website sale
--   'park'       — parked ticket reserves stock
--   'park_void'  — void parked ticket, restore
--   'restock'    — manual +1 stock / restore fallback
--   'adjustment' — default manual adjustment
--   'refund'     — POS or website cancel/refund restore
--
-- Added as NOT VALID so pre-existing rows are never rejected; it is
-- enforced for all new inserts/updates. Run the VALIDATE line afterwards
-- once you've confirmed existing rows conform (optional).
alter table public.inventory_transactions
  drop constraint if exists inventory_transactions_type_check;

alter table public.inventory_transactions
  add constraint inventory_transactions_type_check
  check (type in ('sale', 'park', 'park_void', 'restock', 'adjustment', 'refund'))
  not valid;

-- Optional: enforce against existing rows too (will error if any row has
-- a type outside the list above — fix those rows first, then run this).
-- alter table public.inventory_transactions
--   validate constraint inventory_transactions_type_check;
