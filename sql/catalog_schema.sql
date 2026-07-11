-- Shamaadan E Store — catalog schema (categories, collections, products)
-- Run in Supabase SQL Editor (Dashboard → SQL → New query → Run).
-- Safe to re-run: uses IF NOT EXISTS / DROP CONSTRAINT IF EXISTS patterns.

create extension if not exists pgcrypto;

-- ── Categories ─────────────────────────────────────────────────────
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists categories_name_lower_uidx
  on public.categories (lower(name));

-- ── Collections ────────────────────────────────────────────────────
create table if not exists public.collections (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists collections_name_lower_uidx
  on public.collections (lower(name));

-- ── Products (ensure core table + taxonomy columns) ────────────────
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  barcode text,
  name text not null,
  description text,
  image_url text,
  wholesale_cost numeric(12, 2) not null default 0,
  retail_price numeric(12, 2) not null default 0,
  stock_quantity integer not null default 0,
  min_stock_alert integer not null default 5,
  is_active boolean not null default true,
  category text,
  collection text,
  collection_name text,
  category_id uuid,
  collection_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Add missing columns on existing products tables
alter table public.products add column if not exists barcode text;
alter table public.products add column if not exists description text;
alter table public.products add column if not exists image_url text;
alter table public.products add column if not exists wholesale_cost numeric(12, 2) default 0;
alter table public.products add column if not exists retail_price numeric(12, 2) default 0;
alter table public.products add column if not exists stock_quantity integer default 0;
alter table public.products add column if not exists min_stock_alert integer default 5;
alter table public.products add column if not exists is_active boolean default true;
alter table public.products add column if not exists category text;
alter table public.products add column if not exists collection text;
alter table public.products add column if not exists collection_name text;
alter table public.products add column if not exists category_id uuid;
alter table public.products add column if not exists collection_id uuid;
alter table public.products add column if not exists created_at timestamptz default now();
alter table public.products add column if not exists updated_at timestamptz default now();

-- Drop old FK constraints if present, then re-attach with ON DELETE SET NULL
alter table public.products drop constraint if exists products_category_id_fkey;
alter table public.products drop constraint if exists products_collection_id_fkey;

alter table public.products
  add constraint products_category_id_fkey
  foreign key (category_id) references public.categories (id)
  on delete set null;

alter table public.products
  add constraint products_collection_id_fkey
  foreign key (collection_id) references public.collections (id)
  on delete set null;

create index if not exists products_category_id_idx on public.products (category_id);
create index if not exists products_collection_id_idx on public.products (collection_id);
create index if not exists products_is_active_idx on public.products (is_active);
create index if not exists products_barcode_idx on public.products (barcode);

-- ── Row Level Security (anon/authenticated read+write for storefront/admin client) ──
alter table public.categories enable row level security;
alter table public.collections enable row level security;
alter table public.products enable row level security;

drop policy if exists "categories_select_all" on public.categories;
drop policy if exists "categories_insert_all" on public.categories;
drop policy if exists "categories_update_all" on public.categories;
drop policy if exists "categories_delete_all" on public.categories;

create policy "categories_select_all" on public.categories for select using (true);
create policy "categories_insert_all" on public.categories for insert with check (true);
create policy "categories_update_all" on public.categories for update using (true) with check (true);
create policy "categories_delete_all" on public.categories for delete using (true);

drop policy if exists "collections_select_all" on public.collections;
drop policy if exists "collections_insert_all" on public.collections;
drop policy if exists "collections_update_all" on public.collections;
drop policy if exists "collections_delete_all" on public.collections;

create policy "collections_select_all" on public.collections for select using (true);
create policy "collections_insert_all" on public.collections for insert with check (true);
create policy "collections_update_all" on public.collections for update using (true) with check (true);
create policy "collections_delete_all" on public.collections for delete using (true);

drop policy if exists "products_select_all" on public.products;
drop policy if exists "products_insert_all" on public.products;
drop policy if exists "products_update_all" on public.products;
drop policy if exists "products_delete_all" on public.products;

create policy "products_select_all" on public.products for select using (true);
create policy "products_insert_all" on public.products for insert with check (true);
create policy "products_update_all" on public.products for update using (true) with check (true);
create policy "products_delete_all" on public.products for delete using (true);

-- Seed a default General row so product forms can be used immediately
insert into public.categories (name, description)
select 'General', 'Default category'
where not exists (select 1 from public.categories where lower(name) = 'general');

insert into public.collections (name, description)
select 'General', 'Default collection'
where not exists (select 1 from public.collections where lower(name) = 'general');

notify pgrst, 'reload schema';
