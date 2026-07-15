-- Add website visibility flag (inventory/POS vs online storefront).
-- Run in Supabase SQL Editor after catalog_schema.sql.
-- Safe to re-run.

alter table public.products
  add column if not exists show_on_website boolean not null default true;

-- Existing products were previously visible on the website — keep them published.
update public.products
set show_on_website = true
where show_on_website is distinct from true;

create index if not exists products_show_on_website_idx
  on public.products (show_on_website);

notify pgrst, 'reload schema';
