/** Currency and number formatting helpers shared across apps. */

/**
 * @param {number} amount
 * @param {string} [currency='LYD']
 * @param {string} [locale='en-LY']
 */
export function formatCurrency(amount, currency = 'LYD', locale = 'en-LY') {
  const value = Number(amount) || 0;

  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    const formatted = new Intl.NumberFormat(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
    return `${formatted} ${currency}`;
  }
}

export function formatLyd(amount) {
  return formatCurrency(amount, 'LYD');
}

export function formatCount(value) {
  return new Intl.NumberFormat('en-US').format(value);
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
