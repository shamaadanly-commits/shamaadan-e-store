/** Currency and number formatting helpers shared across apps. */

export function formatCurrency(amount, currency = 'USD', locale = 'en-US') {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

export function formatCount(value) {
  return new Intl.NumberFormat('en-US').format(value);
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
