/**
 * Domain routing configuration.
 * Add production hostnames and local dev aliases here.
 */
export const DOMAIN_CONFIG = {
  storefront: {
    hosts: [
      'shamaadan.ly',
      'www.shamaadan.ly',
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
      'admin.shamaadan.ly',
      'admin.store.com',
      'admin.localhost',
    ],
    label: 'Admin Dashboard',
    css: '/css/dashboard.css',
    module: '/js/admin/app.js',
    title: 'Shamaadan — Admin',
  },

  pos: {
    hosts: [
      'pos.shamaadan.ly',
      'pos.store.com',
      'pos.localhost',
    ],
    label: 'POS Register',
    css: '/css/pos.css',
    module: '/js/pos/app.js',
    title: 'Shamaadan — POS',
  },
};

/** Query-param override for local testing: ?app=storefront | ?app=admin | ?app=pos */
const QUERY_OVERRIDE_KEY = 'app';

/**
 * Resolve which application layer to boot from hostname or dev override.
 * @param {string} [hostname] - Defaults to window.location.hostname
 * @param {URLSearchParams} [searchParams] - Defaults to window.location.search
 * @returns {'storefront' | 'admin' | 'pos'}
 */
export function resolveAppLayer(hostname = window.location.hostname, searchParams = new URLSearchParams(window.location.search)) {
  const override = searchParams.get(QUERY_OVERRIDE_KEY);
  if (override === 'storefront' || override === 'admin' || override === 'pos') {
    return override;
  }

  const normalized = hostname.toLowerCase();

  if (DOMAIN_CONFIG.pos.hosts.some((host) => normalized === host || normalized.endsWith(`.${host}`))) {
    return 'pos';
  }

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
  return DOMAIN_CONFIG[layer] ?? DOMAIN_CONFIG.storefront;
}
