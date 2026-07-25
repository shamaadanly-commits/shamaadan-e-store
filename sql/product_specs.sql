-- Product color & scent specs (variant attributes on flat product rows).
-- Run in Supabase SQL Editor after deploy.
-- Admin enters the same product name for siblings and distinguishes them with color/scent.

alter table public.products
  add column if not exists color text;

alter table public.products
  add column if not exists scent text;

comment on column public.products.color is 'Optional color label for variant grouping (e.g. blue, white).';
comment on column public.products.scent is 'Optional scent/smell label for variant grouping (e.g. lavender, lemon).';

notify pgrst, 'reload schema';
