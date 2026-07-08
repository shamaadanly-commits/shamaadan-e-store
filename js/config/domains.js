/**
 * Domain routing configuration.
 * Add production hostnames and local dev aliases here.
 */
export const DOMAIN_CONFIG = {
  storefront: {
    hosts: [
      'store.com',
      'www.store.com',
      'localhost',
      '127.0.0.1',
    ],
    label: 'Storefront',
    css: '/css/storefront/index.css',
    module: '/js/storefront/app.js',
    title: 'Shamaadan — Shop',
  },

  admin: {
    hosts: [
      'admin.store.com',
      'pos.store.com',
      'admin.localhost',
      'pos.localhost',
    ],
    label: 'POS & Admin',
    css: '/css/pos.css',
    module: '/js/pos/app.js',
    title: 'Shamaadan — POS',
  },
};

/** Query-param override for local testing: ?app=storefront | ?app=pos */
const QUERY_OVERRIDE_KEY = 'app';

/**
 * Resolve which application layer to boot from hostname or dev override.
 * @param {string} [hostname] - Defaults to window.location.hostname
 * @param {URLSearchParams} [searchParams] - Defaults to window.location.search
 * @returns {'storefront' | 'admin'}
 */
export function resolveAppLayer(hostname = window.location.hostname, searchParams = new URLSearchParams(window.location.search)) {
  const override = searchParams.get(QUERY_OVERRIDE_KEY);
  if (override === 'storefront' || override === 'pos' || override === 'admin') {
    return override === 'storefront' ? 'storefront' : 'admin';
  }

  const normalized = hostname.toLowerCase();

  if (DOMAIN_CONFIG.admin.hosts.some((host) => normalized === host || normalized.endsWith(`.${host}`))) {
    return 'admin';
  }

  if (DOMAIN_CONFIG.storefront.hosts.some((host) => normalized === host || normalized.endsWith(`.${host}`))) {
    return 'storefront';
  }

  // Default unknown hosts to storefront (preview URLs, Vercel *.vercel.app)
  return 'storefront';
}

export function getLayerConfig(layer) {
  return DOMAIN_CONFIG[layer];
}
