-- Shamaadan — RLS policies for catalog editing (products + taxonomy)
--
-- Fixes: products can be ADDED but not EDITED. Symptom in the admin
-- dashboard: "Could not save product changes: the row was not updated."
--
-- Cause: row-level security is enabled on public.products (and taxonomy
-- tables) with an INSERT/SELECT policy but no permissive UPDATE/DELETE
-- policy, so edits silently match 0 rows.
--
-- This grants full permissive access, matching the pattern already used by
-- catalog_schema.sql / open_tickets.sql. Safe to run multiple times.

-- ── products ─────────────────────────────────────────────────────────
alter table public.products enable row level security;

drop policy if exists "products_select_all" on public.products;
drop policy if exists "products_insert_all" on public.products;
drop policy if exists "products_update_all" on public.products;
drop policy if exists "products_delete_all" on public.products;

create policy "products_select_all" on public.products for select using (true);
create policy "products_insert_all" on public.products for insert with check (true);
create policy "products_update_all" on public.products for update using (true) with check (true);
create policy "products_delete_all" on public.products for delete using (true);

-- ── categories ───────────────────────────────────────────────────────
alter table public.categories enable row level security;

drop policy if exists "categories_select_all" on public.categories;
drop policy if exists "categories_insert_all" on public.categories;
drop policy if exists "categories_update_all" on public.categories;
drop policy if exists "categories_delete_all" on public.categories;

create policy "categories_select_all" on public.categories for select using (true);
create policy "categories_insert_all" on public.categories for insert with check (true);
create policy "categories_update_all" on public.categories for update using (true) with check (true);
create policy "categories_delete_all" on public.categories for delete using (true);

-- ── collections ──────────────────────────────────────────────────────
alter table public.collections enable row level security;

drop policy if exists "collections_select_all" on public.collections;
drop policy if exists "collections_insert_all" on public.collections;
drop policy if exists "collections_update_all" on public.collections;
drop policy if exists "collections_delete_all" on public.collections;

create policy "collections_select_all" on public.collections for select using (true);
create policy "collections_insert_all" on public.collections for insert with check (true);
create policy "collections_update_all" on public.collections for update using (true) with check (true);
create policy "collections_delete_all" on public.collections for delete using (true);
