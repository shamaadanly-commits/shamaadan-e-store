-- Shamaadan — atomic landed-cost intake for the admin dashboard.
-- Run AFTER accounting_fifo.sql and supplier_invoices.sql.
--
-- One function = one transaction: allocates shipping+customs overhead pro-rata
-- across the product lines, writes supplier_invoices + supplier_invoice_items +
-- inventory_batches (quantity_remaining = received), and increments product stock.
-- SECURITY DEFINER so the browser (anon) client can call it without opening the
-- accounting tables to arbitrary writes.

create or replace function public.process_supplier_invoice(
  p_invoice jsonb,
  p_lines   jsonb
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice_id   bigint;
  v_ship         numeric := round(coalesce((p_invoice->>'total_shipping_transport_cost')::numeric, 0), 4);
  v_customs      numeric := round(coalesce((p_invoice->>'total_customs_duties_cost')::numeric, 0), 4);
  v_overhead     numeric := round(v_ship + v_customs, 4);
  v_total_raw    numeric := 0;
  v_total_landed numeric := 0;
  v_alloc_sum    numeric := 0;
  v_count        int;
  v_idx          int := 0;
  v_line         jsonb;
  v_pid          uuid;
  v_price        numeric;
  v_qty          int;
  v_raw          numeric;
  v_alloc        numeric;
  v_landed       numeric;
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'At least one product line is required.';
  end if;

  if coalesce(trim(p_invoice->>'supplier_name'), '') = '' then
    raise exception 'supplier_name is required.';
  end if;

  -- Pass 1: total raw cost (basis for pro-rata weights).
  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_price := coalesce((v_line->>'supplier_unit_price')::numeric, 0);
    v_qty   := coalesce((v_line->>'quantity')::int, 0);
    if v_qty <= 0 then
      raise exception 'Every line needs a positive quantity.';
    end if;
    if v_price < 0 then
      raise exception 'Supplier unit price cannot be negative.';
    end if;
    v_total_raw := v_total_raw + (v_price * v_qty);
  end loop;

  if v_total_raw <= 0 then
    raise exception 'Total raw cost must be greater than zero.';
  end if;

  v_count := jsonb_array_length(p_lines);

  insert into supplier_invoices (
    supplier_name, invoice_number, invoice_date, currency,
    total_raw_cost, total_shipping_transport_cost, total_customs_duties_cost,
    total_overhead_cost, total_landed_cost, notes
  ) values (
    trim(p_invoice->>'supplier_name'),
    nullif(trim(p_invoice->>'invoice_number'), ''),
    coalesce(nullif(p_invoice->>'invoice_date', '')::date, current_date),
    coalesce(nullif(trim(p_invoice->>'currency'), ''), 'LYD'),
    round(v_total_raw, 4), v_ship, v_customs, v_overhead, 0,
    nullif(trim(p_invoice->>'notes'), '')
  ) returning id into v_invoice_id;

  -- Pass 2: allocate overhead, persist items + batches, bump stock.
  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_idx   := v_idx + 1;
    v_pid   := (v_line->>'product_id')::uuid;
    v_price := round(coalesce((v_line->>'supplier_unit_price')::numeric, 0), 4);
    v_qty   := (v_line->>'quantity')::int;
    v_raw   := v_price * v_qty;

    if v_idx = v_count then
      v_alloc := round(v_overhead - v_alloc_sum, 4);  -- last line absorbs remainder
    else
      v_alloc := round(v_overhead * (v_raw / v_total_raw), 4);
      v_alloc_sum := v_alloc_sum + v_alloc;
    end if;
    if v_alloc < 0 then v_alloc := 0; end if;

    v_landed := round(v_price + (v_alloc / v_qty), 4);
    v_total_landed := v_total_landed + (v_landed * v_qty);

    insert into supplier_invoice_items (
      invoice_id, product_id, supplier_unit_price, quantity_ordered,
      raw_line_cost, allocated_overhead, final_landed_unit_cost
    ) values (
      v_invoice_id, v_pid, v_price, v_qty,
      round(v_raw, 4), v_alloc, v_landed
    );

    insert into inventory_batches (
      product_id, supplier_unit_price, shipping_cost_allocated,
      landed_unit_cost, quantity_received, quantity_remaining
    ) values (
      v_pid, v_price, v_alloc, v_landed, v_qty, v_qty
    );

    update products
       set stock_quantity = coalesce(stock_quantity, 0) + v_qty,
           current_stock  = coalesce(current_stock, 0) + v_qty,
           updated_at     = now()
     where id = v_pid;

    if not found then
      raise exception 'Product % not found; cannot update stock.', v_pid;
    end if;
  end loop;

  update supplier_invoices
     set total_landed_cost = round(v_total_landed, 4)
   where id = v_invoice_id;

  return v_invoice_id;
end;
$$;

grant execute on function public.process_supplier_invoice(jsonb, jsonb) to anon, authenticated;

-- Allow the dashboard to read back recent invoices.
alter table public.supplier_invoices enable row level security;
drop policy if exists "supplier_invoices_select_all" on public.supplier_invoices;
create policy "supplier_invoices_select_all" on public.supplier_invoices for select using (true);

alter table public.supplier_invoice_items enable row level security;
drop policy if exists "supplier_invoice_items_select_all" on public.supplier_invoice_items;
create policy "supplier_invoice_items_select_all" on public.supplier_invoice_items for select using (true);

notify pgrst, 'reload schema';
