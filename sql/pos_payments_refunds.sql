-- POS payment methods + partial refunds
-- Run in Supabase SQL Editor.

alter table public.orders
  add column if not exists payment_reference text;

alter table public.orders
  add column if not exists payment_date date;

comment on column public.orders.payment_method is 'POS: cash | bank_transfer; website: cad | upay';
comment on column public.orders.payment_reference is 'Bank transfer transaction number (POS).';
comment on column public.orders.payment_date is 'Payment date (auto-set on POS charge).';

alter table public.order_items
  add column if not exists refunded_quantity numeric(12, 2) not null default 0;

comment on column public.order_items.refunded_quantity is 'Quantity already refunded from this line (partial refunds).';
