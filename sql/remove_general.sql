-- Shamaadan — remove the stray default "General" collection & category.
--
-- Older versions of catalog_schema.sql seeded a "General" collection and
-- category, and the delete/reassign logic used to recreate them. Both have
-- been fixed in code; run this once to remove the leftover rows.
--
-- products.collection_id / category_id use ON DELETE SET NULL, so any product
-- still pointing at "General" simply becomes uncategorized (no data loss).

-- Optional: clear the legacy text columns that still read "General".
UPDATE public.products SET collection = NULL      WHERE collection = 'General';
UPDATE public.products SET collection_name = NULL WHERE collection_name = 'General';
UPDATE public.products SET category = NULL        WHERE category = 'General';

-- Remove the taxonomy rows (case-insensitive match).
DELETE FROM public.collections WHERE lower(name) = 'general';
DELETE FROM public.categories  WHERE lower(name) = 'general';

NOTIFY pgrst, 'reload schema';
