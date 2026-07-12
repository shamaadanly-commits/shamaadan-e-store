-- Shamaadan — open POS tickets (parked orders)
-- Run in Supabase SQL Editor after catalog_schema.sql

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'pos',
  status text not null default 'completed',
  total_amount numeric(12, 2) not null default 0,
  staff_user_id text,
  staff_name text,
  ticket_label text,
  notes text,
  customer_name text,
  customer_phone text,
  customer_location text,
  downpayment numeric(12, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  parked_at timestamptz,
  completed_at timestamptz
);

alter table public.orders add column if not exists source text default 'pos';
alter table public.orders add column if not exists status text default 'completed';
alter table public.orders add column if not exists total_amount numeric(12, 2) default 0;
alter table public.orders add column if not exists staff_user_id text;
alter table public.orders add column if not exists staff_name text;
alter table public.orders add column if not exists ticket_label text;
alter table public.orders add column if not exists notes text;
alter table public.orders add column if not exists created_at timestamptz default now();
alter table public.orders add column if not exists updated_at timestamptz default now();
alter table public.orders add column if not exists parked_at timestamptz;
alter table public.orders add column if not exists completed_at timestamptz;
alter table public.orders add column if not exists customer_name text;
alter table public.orders add column if not exists customer_phone text;
alter table public.orders add column if not exists customer_location text;
alter table public.orders add column if not exists downpayment numeric(12, 2) not null default 0;

create index if not exists orders_status_idx on public.orders (status);
create index if not exists orders_source_idx on public.orders (source);
create index if not exists orders_created_at_idx on public.orders (created_at desc);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12, 2) not null default 0,
  wholesale_cost numeric(12, 2) not null default 0,
  product_name text,
  created_at timestamptz not null default now()
);

alter table public.order_items add column if not exists product_name text;
alter table public.order_items add column if not exists wholesale_cost numeric(12, 2) default 0;

create index if not exists order_items_order_id_idx on public.order_items (order_id);

alter table public.orders enable row level security;
alter table public.order_items enable row level security;

drop policy if exists "orders_select_all" on public.orders;
drop policy if exists "orders_insert_all" on public.orders;
drop policy if exists "orders_update_all" on public.orders;
drop policy if exists "orders_delete_all" on public.orders;

create policy "orders_select_all" on public.orders for select using (true);
create policy "orders_insert_all" on public.orders for insert with check (true);
create policy "orders_update_all" on public.orders for update using (true) with check (true);
create policy "orders_delete_all" on public.orders for delete using (true);

drop policy if exists "order_items_select_all" on public.order_items;
drop policy if exists "order_items_insert_all" on public.order_items;
drop policy if exists "order_items_update_all" on public.order_items;
drop policy if exists "order_items_delete_all" on public.order_items;

create policy "order_items_select_all" on public.order_items for select using (true);
create policy "order_items_insert_all" on public.order_items for insert with check (true);
create policy "order_items_update_all" on public.order_items for update using (true) with check (true);
create policy "order_items_delete_all" on public.order_items for delete using (true);

notify pgrst, 'reload schema';
