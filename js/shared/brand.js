/**
 * Shared brand assets — used across storefront and POS.
 */
export const BRAND = {
  name: 'Shamaadan',
  logo: '/assets/images/logo.png',
  logoWidth: 1080,
  logoHeight: 1080,
};

/**
 * Render the brand logo image with explicit dimensions to prevent CLS.
 * @param {object} [opts]
 * @param {string} [opts.className]
 * @param {'header' | 'footer' | 'hero' | 'ritual' | 'mark'} [opts.size]
 * @param {string} [opts.alt]
 * @param {'eager' | 'lazy'} [opts.loading]
 */
export function logoImg({
  className = '',
  size = 'header',
  alt = BRAND.name,
  loading = 'lazy',
} = {}) {
  const sizes = {
    header: 44,
    footer: 56,
    hero: 200,
    ritual: 160,
    mark: 32,
  };

  const px = sizes[size] ?? sizes.header;

  return `<img
    src="${BRAND.logo}"
    alt="${alt}"
    class="${className}"
    width="${px}"
    height="${px}"
    loading="${loading}"
    decoding="async"
  >`;
}
