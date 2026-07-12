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
