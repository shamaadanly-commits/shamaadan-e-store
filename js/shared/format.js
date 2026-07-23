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

/**
 * Convert Western digits 0-9 to Arabic-Indic digits ٠-٩ (for print labels).
 * Keeps separators like + - ( ) and spaces.
 * @param {string|number|null|undefined} value
 * @returns {string}
 */
export function toArabicDigits(value) {
  const western = '0123456789';
  const arabic = '٠١٢٣٤٥٦٧٨٩';
  return String(value ?? '').replace(/[0-9]/g, (d) => arabic[western.indexOf(d)] ?? d);
}

/**
 * Format a phone number with Arabic-Indic digits for printed receipts.
 * @param {string|number|null|undefined} phone
 * @returns {string}
 */
export function formatPhoneArabic(phone) {
  const raw = String(phone ?? '').trim();
  if (!raw) return '—';
  return toArabicDigits(raw);
}

export function formatCount(value) {
  return new Intl.NumberFormat('en-US').format(value);
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
