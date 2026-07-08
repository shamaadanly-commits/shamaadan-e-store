/**
 * Language toggle — sync UI state after render.
 */

/**
 * @param {HTMLElement} root
 * @param {ReturnType<import('./i18n.js').createI18n>} i18n
 */
export function syncLangToggle(root, i18n) {
  const group = root.querySelector('[data-lang-toggle]');
  if (!group) return;

  const loc = i18n.getLocale();
  group.setAttribute('aria-label', i18n.t('nav.switchLang'));

  group.querySelectorAll('[data-lang-option]').forEach((btn) => {
    const code = btn.getAttribute('data-lang-option');
    const isActive = code === loc;
    btn.classList.toggle('is-active', isActive);
    btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
}

/**
 * Handle language option click — call from root event delegation.
 * @param {HTMLElement} target
 * @param {ReturnType<import('./i18n.js').createI18n>} i18n
 * @returns {boolean} true if locale changed
 */
export function handleLangClick(target, i18n) {
  const btn = target.closest('[data-lang-option]');
  if (!btn) return false;

  const next = btn.getAttribute('data-lang-option');
  if (next !== 'en' && next !== 'ar') return false;
  if (next === i18n.getLocale()) return false;

  i18n.setLocale(next);
  return true;
}
