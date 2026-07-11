/**
 * Shared Supabase client — single source of truth for both Storefront and POS.
 * Credentials are injected at runtime via window.__ENV__ (see /api/env.js).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

let client = null;

function first(env, keys) {
  for (const key of keys) {
    const value = env?.[key];
    if (value && String(value).trim()) return String(value).trim();
  }
  return '';
}

function readEnv() {
  const env = window.__ENV__ ?? {};
  return {
    url: first(env, [
      'VITE_SUPABASE_URL',
      'SUPABASE_URL',
      'NEXT_PUBLIC_SUPABASE_URL',
      'PUBLIC_SUPABASE_URL',
    ]),
    anonKey: first(env, [
      'VITE_SUPABASE_ANON_KEY',
      'SUPABASE_ANON_KEY',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'PUBLIC_SUPABASE_ANON_KEY',
      'VITE_SUPABASE_PUBLISHABLE_KEY',
      'SUPABASE_PUBLISHABLE_KEY',
    ]),
  };
}

/**
 * Returns the singleton Supabase client. Safe to call from any module.
 * @returns {import('@supabase/supabase-js').SupabaseClient | null}
 */
export function getSupabase() {
  if (client) return client;

  const { url, anonKey } = readEnv();

  if (!url || !anonKey) {
    console.warn('[supabase] Missing credentials — running in offline/mock mode.');
    return null;
  }

  client = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    realtime: {
      params: { eventsPerSecond: 10 },
    },
  });

  return client;
}

/** Reset client (useful in tests). */
export function resetSupabaseClient() {
  client = null;
}
