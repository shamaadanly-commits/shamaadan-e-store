-- Allow POS refund transactions (restores stock after a completed sale).
-- Run in Supabase SQL Editor after inventory_transactions_rls.sql.

alter table public.inventory_transactions
  drop constraint if exists inventory_transactions_type_check;

alter table public.inventory_transactions
  add constraint inventory_transactions_type_check
  check (type in ('sale', 'park', 'park_void', 'restock', 'adjustment', 'refund'))
  not valid;

notify pgrst, 'reload schema';
