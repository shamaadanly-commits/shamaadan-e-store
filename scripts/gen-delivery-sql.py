# -*- coding: utf-8 -*-
import json
from pathlib import Path

root = Path(r"C:\Users\user\Desktop\Shamaadan E Store")
rows = json.loads((root / "js/shared/delivery-rates-seed.json").read_text(encoding="utf-8"))


def esc(s):
    return str(s).replace("'", "''")


parts = []
parts.append("-- Delivery rates by city/area for website checkout.")
parts.append("-- SAFE: creates ONLY public.delivery_rates — does NOT touch products/inventory.")
parts.append("-- Run once in Supabase SQL Editor.")
parts.append("")
parts.append("create extension if not exists pgcrypto;")
parts.append("")
parts.append("""create table if not exists public.delivery_rates (
  id uuid primary key default gen_random_uuid(),
  city_ar text not null,
  city_en text,
  zone text not null check (zone in ('inside_benghazi', 'outside_benghazi')),
  price_lyd numeric(12, 2) not null default 0 check (price_lyd >= 0),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);""")
parts.append("")
parts.append("create unique index if not exists delivery_rates_zone_city_ar_uidx")
parts.append("  on public.delivery_rates (zone, city_ar);")
parts.append("create index if not exists delivery_rates_zone_idx on public.delivery_rates (zone);")
parts.append("create index if not exists delivery_rates_active_idx on public.delivery_rates (is_active);")
parts.append("")
parts.append("alter table public.delivery_rates enable row level security;")
parts.append('drop policy if exists "delivery_rates_select_all" on public.delivery_rates;')
parts.append('drop policy if exists "delivery_rates_insert_all" on public.delivery_rates;')
parts.append('drop policy if exists "delivery_rates_update_all" on public.delivery_rates;')
parts.append('drop policy if exists "delivery_rates_delete_all" on public.delivery_rates;')
parts.append('create policy "delivery_rates_select_all" on public.delivery_rates for select using (true);')
parts.append('create policy "delivery_rates_insert_all" on public.delivery_rates for insert with check (true);')
parts.append('create policy "delivery_rates_update_all" on public.delivery_rates for update using (true) with check (true);')
parts.append('create policy "delivery_rates_delete_all" on public.delivery_rates for delete using (true);')
parts.append("")
parts.append("-- Seed Libya rates (skips existing cities — will not overwrite admin price edits).")
parts.append("insert into public.delivery_rates (city_ar, city_en, zone, price_lyd, sort_order)")
parts.append("values")
vals = []
for r in rows:
    vals.append(
        f"  ('{esc(r['city_ar'])}', '{esc(r['city_en'])}', '{r['zone']}', {float(r['price_lyd']):.2f}, {int(r['sort_order'])})"
    )
parts.append(",\n".join(vals))
parts.append("on conflict (zone, city_ar) do nothing;")
parts.append("")
parts.append("notify pgrst, 'reload schema';")
parts.append("")

(root / "sql/delivery_rates.sql").write_text("\n".join(parts), encoding="utf-8")
print(f"wrote {len(rows)} rates")
