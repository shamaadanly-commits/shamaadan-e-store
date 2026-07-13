-- Shamaadan — atomic inventory waste / spoilage intake for the admin dashboard.
-- Run AFTER accounting_fifo.sql (and ideally process_supplier_invoice.sql).
--
-- Recording waste does two things atomically (one transaction):
--   1. INVENTORY  → deducts the quantity FIFO from inventory_batches and lowers
--                   products.stock_quantity + current_stock.
--   2. ACCOUNTING → writes inventory_waste rows carrying the landed unit_cost so
--                   the loss is captured (shown in the Waste list + daily backup).
--
-- SECURITY DEFINER so the browser (anon) client can call it without exposing the
-- accounting tables to arbitrary writes.

-- Capture the cost of each wasted unit; allow waste of stock that has no batch
-- (e.g. products created straight in the catalog with no purchase invoice yet).
alter table public.inventory_waste
  add column if not exists unit_cost decimal(14, 4) not null default 0;
alter table public.inventory_waste
  alter column batch_id drop not null;

create or replace function public.process_inventory_waste(
  p_product_id uuid,
  p_quantity   int,
  p_reason     text
) returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_need       int := p_quantity;
  v_take       int;
  v_total_cost numeric := 0;
  v_available  int;
  v_fallback   numeric;
  v_reason     text := coalesce(nullif(trim(p_reason), ''), 'Unspecified');
  v_batch      record;
begin
  if p_product_id is null then
    raise exception 'A product is required.';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Waste quantity must be greater than zero.';
  end if;

  -- Make sure the product exists and has enough stock overall.
  select coalesce(current_stock, coalesce(stock_quantity, 0)), coalesce(wholesale_cost, 0)
    into v_available, v_fallback
    from products
   where id = p_product_id
   for update;

  if not found then
    raise exception 'Product % not found.', p_product_id;
  end if;
  if v_available < p_quantity then
    raise exception 'Not enough stock to waste. Available: %, requested: %.', v_available, p_quantity;
  end if;

  -- Pass 1: consume open batches oldest-first (FIFO).
  for v_batch in
    select id, quantity_remaining, landed_unit_cost
      from inventory_batches
     where product_id = p_product_id
       and quantity_remaining > 0
     order by received_at asc, id asc
     for update
  loop
    exit when v_need <= 0;
    v_take := least(v_batch.quantity_remaining, v_need);

    insert into inventory_waste (product_id, batch_id, quantity, waste_reason, unit_cost)
    values (p_product_id, v_batch.id, v_take, v_reason, v_batch.landed_unit_cost);

    update inventory_batches
       set quantity_remaining = quantity_remaining - v_take
     where id = v_batch.id;

    v_total_cost := v_total_cost + (v_take * v_batch.landed_unit_cost);
    v_need := v_need - v_take;
  end loop;

  -- Pass 2: any remainder is untracked catalog stock — record at product cost.
  if v_need > 0 then
    insert into inventory_waste (product_id, batch_id, quantity, waste_reason, unit_cost)
    values (p_product_id, null, v_need, v_reason, v_fallback);

    v_total_cost := v_total_cost + (v_need * v_fallback);
    v_need := 0;
  end if;

  -- Deduct from the live stock counters.
  update products
     set stock_quantity = greatest(coalesce(stock_quantity, 0) - p_quantity, 0),
         current_stock  = greatest(coalesce(current_stock, 0) - p_quantity, 0),
         updated_at     = now()
   where id = p_product_id;

  return round(v_total_cost, 4);
end;
$$;

grant execute on function public.process_inventory_waste(uuid, int, text) to anon, authenticated;

-- Allow the dashboard to read back recent waste records.
alter table public.inventory_waste enable row level security;
drop policy if exists "inventory_waste_select_all" on public.inventory_waste;
create policy "inventory_waste_select_all" on public.inventory_waste for select using (true);

notify pgrst, 'reload schema';
