-- Product images — Supabase Storage bucket (run in SQL Editor once)
-- Used when Cloudflare R2 is not configured. Makes uploads durable.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  7340032,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Public read
drop policy if exists "Public read product images" on storage.objects;
create policy "Public read product images"
  on storage.objects
  for select
  using (bucket_id = 'product-images');

-- Allow anon/authenticated uploads (admin uses anon key)
drop policy if exists "Anyone can upload product images" on storage.objects;
create policy "Anyone can upload product images"
  on storage.objects
  for insert
  with check (bucket_id = 'product-images');

-- Allow replacing / deleting own uploads if needed
drop policy if exists "Anyone can update product images" on storage.objects;
create policy "Anyone can update product images"
  on storage.objects
  for update
  using (bucket_id = 'product-images')
  with check (bucket_id = 'product-images');

drop policy if exists "Anyone can delete product images" on storage.objects;
create policy "Anyone can delete product images"
  on storage.objects
  for delete
  using (bucket_id = 'product-images');
