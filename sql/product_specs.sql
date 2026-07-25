-- Product color & specs (variant attributes on flat product rows).
-- Run in Supabase SQL Editor after deploy.
-- Admin enters the same product name for siblings and distinguishes them with color/specs.
-- Each row keeps its own barcode, stock, and price.

alter table public.products
  add column if not exists color text;

alter table public.products
  add column if not exists scent text;

comment on column public.products.color is 'Optional color label for variant grouping (e.g. blue, white).';
comment on column public.products.scent is 'Optional specs label for variant grouping (size, scent, material, etc.).';

notify pgrst, 'reload schema';
