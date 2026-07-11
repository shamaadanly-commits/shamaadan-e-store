/**
 * ID helpers — distinguish live Supabase UUIDs from legacy mock/local ids (p1, p-abc, slugs).
 */

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    String(value || '').trim(),
  );
}

/**
 * Only UUID primary keys may be sent to Supabase .eq('id', …) filters.
 * @param {unknown} value
 */
export function isLiveDbId(value) {
  return isUuid(value);
}
