/**
 * Serverless gateway — exposes hostname-aware routing metadata for edge/middleware use.
 * Client-side router remains the primary dispatcher; this endpoint supports
 * health checks, SSR hints, and future server-driven redirects.
 */
export default function handler(req, res) {
  const host = (req.headers['x-forwarded-host'] || req.headers.host || '').split(':')[0].toLowerCase();

  const adminHosts = (process.env.ADMIN_HOST || 'admin.store.com').split(',').map((h) => h.trim());
  const posHosts = (process.env.POS_HOST || 'pos.store.com').split(',').map((h) => h.trim());
  const storefrontHosts = (process.env.STOREFRONT_HOST || 'store.com').split(',').map((h) => h.trim());

  let layer = 'storefront';

  if (adminHosts.includes(host) || host.startsWith('admin.')) {
    layer = 'admin';
  } else if (posHosts.includes(host) || host.startsWith('pos.')) {
    layer = 'pos';
  } else if (storefrontHosts.includes(host)) {
    layer = 'storefront';
  }

  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-App-Layer', layer);

  res.status(200).json({
    ok: true,
    host,
    layer,
    timestamp: new Date().toISOString(),
  });
}
