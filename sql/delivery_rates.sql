-- Delivery rates by city/area for website checkout.
-- SAFE: creates ONLY public.delivery_rates — does NOT touch products/inventory.
-- Run once in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.delivery_rates (
  id uuid primary key default gen_random_uuid(),
  city_ar text not null,
  city_en text,
  zone text not null check (zone in ('inside_benghazi', 'outside_benghazi')),
  price_lyd numeric(12, 2) not null default 0 check (price_lyd >= 0),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists delivery_rates_zone_city_ar_uidx
  on public.delivery_rates (zone, city_ar);
create index if not exists delivery_rates_zone_idx on public.delivery_rates (zone);
create index if not exists delivery_rates_active_idx on public.delivery_rates (is_active);

alter table public.delivery_rates enable row level security;
drop policy if exists "delivery_rates_select_all" on public.delivery_rates;
drop policy if exists "delivery_rates_insert_all" on public.delivery_rates;
drop policy if exists "delivery_rates_update_all" on public.delivery_rates;
drop policy if exists "delivery_rates_delete_all" on public.delivery_rates;
create policy "delivery_rates_select_all" on public.delivery_rates for select using (true);
create policy "delivery_rates_insert_all" on public.delivery_rates for insert with check (true);
create policy "delivery_rates_update_all" on public.delivery_rates for update using (true) with check (true);
create policy "delivery_rates_delete_all" on public.delivery_rates for delete using (true);

-- Seed Libya rates (skips existing cities — will not overwrite admin price edits).
insert into public.delivery_rates (city_ar, city_en, zone, price_lyd, sort_order)
values
  ('البركة', 'Al Birkah', 'inside_benghazi', 10.00, 0),
  ('أرض بن علي', 'Ard Bin Ali', 'inside_benghazi', 10.00, 1),
  ('أرض بلعون', 'Ard Baloun', 'inside_benghazi', 10.00, 2),
  ('بوزغيبة', 'Bouzghiba', 'inside_benghazi', 10.00, 3),
  ('الحميضة', 'Al Humaidah', 'inside_benghazi', 10.00, 4),
  ('الرويسات', 'Al Rwisat', 'inside_benghazi', 10.00, 5),
  ('الرحبة', 'Al Rahba', 'inside_benghazi', 10.00, 6),
  ('حي لبنان', 'Hai Lebanon', 'inside_benghazi', 10.00, 7),
  ('حي الزيتون', 'Hai Al Zaytun', 'inside_benghazi', 10.00, 8),
  ('طابلينو', 'Tabalino', 'inside_benghazi', 10.00, 9),
  ('جليانة', 'Jilyanah', 'inside_benghazi', 10.00, 10),
  ('راس عبيدة', 'Ras Obeida', 'inside_benghazi', 10.00, 11),
  ('سيدي حسين', 'Sidi Hussein', 'inside_benghazi', 10.00, 12),
  ('حي فاتح', 'Hai Fateh', 'inside_benghazi', 10.00, 13),
  ('الفويهات', 'Al Fuwayhat', 'inside_benghazi', 10.00, 14),
  ('السلماني', 'Al Salmani', 'inside_benghazi', 10.00, 15),
  ('الماجوري', 'Al Majouri', 'inside_benghazi', 10.00, 16),
  ('الحدائق', 'Al Hadaeq', 'inside_benghazi', 10.00, 17),
  ('الكيش', 'Al Kish', 'inside_benghazi', 10.00, 18),
  ('الليثي', 'Al Laithi', 'inside_benghazi', 10.00, 19),
  ('بوهديمة', 'Buhdima', 'inside_benghazi', 10.00, 20),
  ('أرض لملوم', 'Ard Lamloum', 'inside_benghazi', 10.00, 21),
  ('حي السلام', 'Hai Al Salam', 'inside_benghazi', 15.00, 22),
  ('سيدي خريبيش', 'Sidi Khribish', 'inside_benghazi', 15.00, 23),
  ('أرض الحراسة', 'Ard Al Harasa', 'inside_benghazi', 15.00, 24),
  ('أرض التيناز', 'Ard Al Tinaz', 'inside_benghazi', 15.00, 25),
  ('أرض البيجو', 'Ard Al Bijo', 'inside_benghazi', 15.00, 26),
  ('المساكن', 'Al Masakin', 'inside_benghazi', 15.00, 27),
  ('الزريريعية', 'Al Zririyia', 'inside_benghazi', 15.00, 28),
  ('السرتي', 'Al Sirti', 'inside_benghazi', 15.00, 29),
  ('اللثامة', 'Al Lathama', 'inside_benghazi', 15.00, 30),
  ('بوصنيب', 'Bousnib', 'inside_benghazi', 15.00, 31),
  ('قنفودة', 'Ganfouda', 'inside_benghazi', 15.00, 32),
  ('قاريونس', 'Garyounis', 'inside_benghazi', 15.00, 33),
  ('وسط البلاد', 'City Center (Wast Al Bilad)', 'inside_benghazi', 15.00, 34),
  ('الحي الدبلوماسي', 'Diplomatic Quarter (Hai Al Diplomasi)', 'inside_benghazi', 15.00, 35),
  ('السيدة عائشة', 'Sayeda Aisha', 'inside_benghazi', 15.00, 36),
  ('أرض شبنة', 'Ard Shabna', 'inside_benghazi', 15.00, 37),
  ('أرض قريش', 'Ard Quraish', 'inside_benghazi', 15.00, 38),
  ('بوعطني', 'Buatni', 'inside_benghazi', 15.00, 39),
  ('حي الروضة', 'Hai Al Rawda', 'inside_benghazi', 15.00, 40),
  ('حي السراج', 'Hai Al Sarraj', 'inside_benghazi', 15.00, 41),
  ('حي الدولار', 'Hai Al Dollar', 'inside_benghazi', 15.00, 42),
  ('حي المهندسين', 'Hai Al Muhandiseen', 'inside_benghazi', 15.00, 43),
  ('الهواري', 'Al Hawari', 'inside_benghazi', 15.00, 44),
  ('حي قطر', 'Hai Qatar', 'inside_benghazi', 15.00, 45),
  ('الصابري', 'Al Sabri', 'inside_benghazi', 15.00, 46),
  ('سيدي يونس', 'Sidi Younis', 'inside_benghazi', 15.00, 47),
  ('بن يونس', 'Bin Younis', 'inside_benghazi', 15.00, 48),
  ('شبنة', 'Shabna', 'inside_benghazi', 15.00, 49),
  ('القوارشة', 'Al Qawarishah', 'inside_benghazi', 15.00, 50),
  ('الوحيشي', 'Al Waheishi', 'inside_benghazi', 15.00, 51),
  ('تيكا', 'Tikah', 'inside_benghazi', 20.00, 52),
  ('الكويفية', 'Al Kuwayfiyah', 'inside_benghazi', 20.00, 53),
  ('بودزيرة', 'Bou Dzira', 'inside_benghazi', 20.00, 54),
  ('أرض الكواديك', 'Ard Al Kawadik', 'inside_benghazi', 20.00, 55),
  ('الطلحية', 'Al Talhiya', 'inside_benghazi', 20.00, 56),
  ('بوهادي', 'Bouhadi', 'inside_benghazi', 25.00, 57),
  ('سيدي فرج', 'Sidi Faraj', 'inside_benghazi', 25.00, 58),
  ('بنينا', 'Benina', 'inside_benghazi', 25.00, 59),
  ('سيدي خليفة', 'Sidi Khalifa', 'inside_benghazi', 25.00, 60),
  ('المقزحة', 'Al Maqza', 'inside_benghazi', 35.00, 61),
  ('قمينس', 'Qaminis', 'outside_benghazi', 20.00, 0),
  ('القيقب', 'Al Qayqab', 'outside_benghazi', 20.00, 1),
  ('الأبرق', 'Al Abraq', 'outside_benghazi', 20.00, 2),
  ('شحات', 'Shahat', 'outside_benghazi', 20.00, 3),
  ('البيضاء', 'Al Bayda', 'outside_benghazi', 20.00, 4),
  ('قصر ليبيا', 'Qasr Libya', 'outside_benghazi', 20.00, 5),
  ('دريانة', 'Driana', 'outside_benghazi', 20.00, 6),
  ('توكرة', 'Tukrah', 'outside_benghazi', 20.00, 7),
  ('تاكنس', 'Tacnis', 'outside_benghazi', 20.00, 8),
  ('المرج', 'Al Marj', 'outside_benghazi', 20.00, 9),
  ('درنة', 'Derna', 'outside_benghazi', 20.00, 10),
  ('إجدابيا', 'Ajdabiya', 'outside_benghazi', 20.00, 11),
  ('المقرون', 'Al Maqrun', 'outside_benghazi', 20.00, 12),
  ('عين مارة', 'Ain Mara', 'outside_benghazi', 20.00, 13),
  ('فرزوقة', 'Farzugha', 'outside_benghazi', 20.00, 14),
  ('برسس', 'Bersis', 'outside_benghazi', 20.00, 15),
  ('مسه', 'Massa', 'outside_benghazi', 20.00, 16),
  ('القبة', 'Al Qubbah', 'outside_benghazi', 20.00, 17),
  ('طبرق', 'Tobruk', 'outside_benghazi', 20.00, 18),
  ('سرت', 'Sirte', 'outside_benghazi', 25.00, 19),
  ('هراوة', 'Harawa', 'outside_benghazi', 25.00, 20),
  ('مصراته', 'Misrata', 'outside_benghazi', 25.00, 21),
  ('العقيلة', 'Al Uqaylah', 'outside_benghazi', 25.00, 22),
  ('العلوص', 'Al Alous', 'outside_benghazi', 25.00, 23),
  ('بشر', 'Bishr', 'outside_benghazi', 25.00, 24),
  ('راس لانوف', 'Ras Lanuf', 'outside_benghazi', 25.00, 25),
  ('بن جواد', 'Bin Jawad', 'outside_benghazi', 25.00, 26),
  ('بوقرين', 'Abu Qurayn', 'outside_benghazi', 25.00, 27),
  ('البريقة', 'Brega', 'outside_benghazi', 30.00, 28),
  ('طرابلس', 'Tripoli', 'outside_benghazi', 30.00, 29),
  ('الخمس', 'Al Khums', 'outside_benghazi', 30.00, 30),
  ('زليتن', 'Zliten', 'outside_benghazi', 30.00, 31),
  ('امساعد', 'Musaid', 'outside_benghazi', 30.00, 32),
  ('الأبيار', 'Al Abyar', 'outside_benghazi', 30.00, 33),
  ('لاثرون', 'Lathrun', 'outside_benghazi', 35.00, 34),
  ('سوسة', 'Susa', 'outside_benghazi', 35.00, 35),
  ('الفتايح', 'Al Fatayah', 'outside_benghazi', 35.00, 36),
  ('أم الرزم', 'Umm al Rizam', 'outside_benghazi', 35.00, 37),
  ('راس الهلال', 'Ras al Helal', 'outside_benghazi', 35.00, 38),
  ('هون', 'Hun', 'outside_benghazi', 40.00, 39),
  ('ودان', 'Waddan', 'outside_benghazi', 40.00, 40),
  ('سبها', 'Sabha', 'outside_benghazi', 40.00, 41),
  ('الكفرة', 'Kufra', 'outside_benghazi', 40.00, 42),
  ('جالو', 'Jalu', 'outside_benghazi', 40.00, 43),
  ('أوجلة', 'Awjila', 'outside_benghazi', 40.00, 44),
  ('الجفرة', 'Al Jufra', 'outside_benghazi', 40.00, 45),
  ('سلوق', 'Suluq', 'outside_benghazi', 40.00, 46),
  ('بن وليد', 'Bani Walid', 'outside_benghazi', 40.00, 47),
  ('أم الأرانب', 'Umm al Aranib', 'outside_benghazi', 45.00, 48),
  ('اجخره', 'Jikharra', 'outside_benghazi', 45.00, 49),
  ('أوباري', 'Ubari', 'outside_benghazi', 45.00, 50),
  ('تازربو', 'Tazirbu', 'outside_benghazi', 45.00, 51),
  ('الجميل', 'Al Jamil', 'outside_benghazi', 50.00, 52),
  ('رقدالين', 'Rigdalin', 'outside_benghazi', 50.00, 53),
  ('العجيلات', 'Al Ajeelat', 'outside_benghazi', 50.00, 54),
  ('زوارة', 'Zuwara', 'outside_benghazi', 50.00, 55),
  ('غريان', 'Gharyan', 'outside_benghazi', 50.00, 56),
  ('براك الشاطي', 'Brak Al Shati', 'outside_benghazi', 50.00, 57),
  ('الزنتان', 'Zintan', 'outside_benghazi', 50.00, 58),
  ('الزاوية', 'Zawiya', 'outside_benghazi', 50.00, 59),
  ('مرزق', 'Murzuq', 'outside_benghazi', 50.00, 60)
on conflict (zone, city_ar) do nothing;

notify pgrst, 'reload schema';
