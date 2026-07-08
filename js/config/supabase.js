/**
 * Shared Supabase client — single source of truth for both Storefront and POS.
 * Credentials are injected at build/runtime via window.__ENV__ (see index.html).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

let client = null;

function readEnv() {
  const env = window.__ENV__ ?? {};
  return {
    url: env.VITE_SUPABASE_URL || '',
    anonKey: env.VITE_SUPABASE_ANON_KEY || '',
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
