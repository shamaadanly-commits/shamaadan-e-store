-- Shamaadan — sequential invoice numbers for POS, parked tickets, and website orders.
-- Run in Supabase SQL Editor after open_tickets.sql.
-- Safe to re-run.

-- ── Extra columns on orders (website checkout + invoicing) ─────────
alter table public.orders add column if not exists invoice_number text;
alter table public.orders add column if not exists payment_method text;
alter table public.orders add column if not exists payment_status text;
alter table public.orders add column if not exists customer_email text;
alter table public.orders add column if not exists customer_address text;
alter table public.orders add column if not exists customer_city text;
alter table public.orders add column if not exists shipping_amount numeric(12, 2) not null default 0;
alter table public.orders add column if not exists subtotal_amount numeric(12, 2) not null default 0;

create unique index if not exists orders_invoice_number_uidx
  on public.orders (invoice_number)
  where invoice_number is not null;

create index if not exists orders_invoice_number_idx on public.orders (invoice_number);

-- ── Per-channel yearly counters ─────────────────────────────────────
create table if not exists public.invoice_counters (
  channel text not null,
  year integer not null,
  last_value integer not null default 0,
  primary key (channel, year)
);

-- channel: 'pos' | 'ticket' | 'web'
-- Returns e.g. POS-2026-000042, TKT-2026-000003, WEB-2026-000015
create or replace function public.next_invoice_number(p_channel text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year integer := extract(year from now())::integer;
  v_prefix text;
  v_next integer;
begin
  case p_channel
    when 'web' then v_prefix := 'WEB';
    when 'ticket' then v_prefix := 'TKT';
    else v_prefix := 'POS';
  end case;

  insert into public.invoice_counters (channel, year, last_value)
  values (p_channel, v_year, 1)
  on conflict (channel, year)
  do update set last_value = public.invoice_counters.last_value + 1
  returning last_value into v_next;

  return v_prefix || '-' || v_year::text || '-' || lpad(v_next::text, 6, '0');
end;
$$;

-- Auto-assign invoice_number on every new order row.
create or replace function public.orders_assign_invoice_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_channel text;
begin
  if new.invoice_number is not null and btrim(new.invoice_number) <> '' then
    return new;
  end if;

  if coalesce(new.source, 'pos') in ('online', 'storefront', 'website', 'web') then
    v_channel := 'web';
  elsif new.status in ('open', 'parked') then
    v_channel := 'ticket';
  else
    v_channel := 'pos';
  end if;

  new.invoice_number := public.next_invoice_number(v_channel);
  return new;
end;
$$;

drop trigger if exists orders_assign_invoice_number_trg on public.orders;
create trigger orders_assign_invoice_number_trg
  before insert on public.orders
  for each row
  execute function public.orders_assign_invoice_number();

grant execute on function public.next_invoice_number(text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
