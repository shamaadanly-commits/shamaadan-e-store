/**
 * Shared brand assets — used across storefront and POS.
 */
import { PRINT_LOGO_DATA_URI, PRINT_FONT_DATA_URI } from './print-assets.js';

export const BRAND = {
  name: 'Shamaadan',
  nameAr: 'شمعدان',
  logo: '/assets/images/logo.png',
  font: '/assets/images/iwanzazapersonal-Regular.otf',
  logoWidth: 1080,
  logoHeight: 1080,
};

/**
 * Asset URLs for print windows.
 * Uses embedded data URIs so logos/fonts always render in about:blank print docs.
 * @returns {{ logo: string, font: string, origin: string }}
 */
export function printAssetUrls() {
  const origin = typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin
    : '';
  return {
    origin,
    logo: PRINT_LOGO_DATA_URI,
    font: PRINT_FONT_DATA_URI,
  };
}

/**
 * @font-face CSS for Iwanzaza Personal in print documents.
 * @param {string} fontUrl
 */
export function printFontFaceCss(fontUrl) {
  return `
    @font-face {
      font-family: 'Iwanzaza Personal';
      src: url('${fontUrl}') format('opentype');
      font-weight: 400;
      font-style: normal;
      font-display: block;
    }
  `;
}

/**
 * Render the brand logo image with explicit dimensions to prevent CLS.
 * @param {object} [opts]
 * @param {string} [opts.className]
 * @param {'header' | 'footer' | 'hero' | 'ritual' | 'mark'} [opts.size]
 * @param {string} [opts.alt]
 * @param {'eager' | 'lazy'} [opts.loading]
 * @param {string} [opts.src]
 */
export function logoImg({
  className = '',
  size = 'header',
  alt = BRAND.name,
  loading = 'lazy',
  src = BRAND.logo,
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
    src="${src}"
    alt="${alt}"
    class="${className}"
    width="${px}"
    height="${px}"
    loading="${loading}"
    decoding="async"
  >`;
}
