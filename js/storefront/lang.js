/**
 * Language toggle — header button and locale switching.
 */

/**
 * @param {HTMLElement} root
 * @param {ReturnType<import('./i18n.js').createI18n>} i18n
 */
export function bindLangToggle(root, i18n, onSwitch) {
  const btn = root.querySelector('[data-lang-toggle]');
  if (!btn) return;

  if (bindLangToggle._unsub) bindLangToggle._unsub();

  function syncButton() {
    const loc = i18n.getLocale();
    btn.setAttribute('aria-label', i18n.t('nav.switchLang'));
    btn.dataset.locale = loc;

    const enEl = btn.querySelector('[data-lang-option="en"]');
    const arEl = btn.querySelector('[data-lang-option="ar"]');
    enEl?.classList.toggle('is-active', loc === 'en');
    arEl?.classList.toggle('is-active', loc === 'ar');
  }

  btn.addEventListener('click', (event) => {
    const option = event.target.closest('[data-lang-option]');
    if (option) {
      const next = option.dataset.langOption;
      if (next === 'en' || next === 'ar') i18n.setLocale(next);
      return;
    }
    i18n.toggleLocale();
  });

  bindLangToggle._unsub = i18n.subscribe(() => {
    syncButton();
    onSwitch();
  });

  syncButton();
}
