/**
 * Header navigation — scroll state, mobile drawer, section spy.
 */

/**
 * @param {HTMLElement} root
 * @param {ReturnType<import('./i18n.js').createI18n>} i18n
 */
export function initNav(root, i18n) {
  const header = root.querySelector('[data-header]');
  const menuBtn = root.querySelector('[data-menu-toggle]');
  const drawer = root.querySelector('[data-nav-drawer]');
  const navLinks = root.querySelectorAll('[data-nav-link]');
  const sections = ['shop', 'about', 'collections', 'ritual', 'contact'];

  function onScroll() {
    const y = window.scrollY;
    header?.classList.toggle('is-scrolled', y > 40);
    updateActiveLink();
  }

  function updateActiveLink() {
    const offset = (header?.offsetHeight ?? 72) + 20;
    let current = '';

    for (const id of sections) {
      const el = root.querySelector(`#${id}`);
      if (!el) continue;
      const top = el.getBoundingClientRect().top;
      if (top <= offset) current = id;
    }

    navLinks.forEach((link) => {
      const href = link.getAttribute('href')?.replace('#', '') ?? '';
      link.classList.toggle('is-active', href === current);
    });
  }

  function openDrawer() {
    drawer?.removeAttribute('hidden');
    requestAnimationFrame(() => drawer?.classList.add('is-open'));
    menuBtn?.setAttribute('aria-expanded', 'true');
    menuBtn?.setAttribute('aria-label', i18n.t('nav.closeMenu'));
    document.body.style.overflow = 'hidden';
  }

  function closeDrawer() {
    drawer?.classList.remove('is-open');
    menuBtn?.setAttribute('aria-expanded', 'false');
    menuBtn?.setAttribute('aria-label', i18n.t('nav.openMenu'));
    document.body.style.overflow = '';
    setTimeout(() => drawer?.setAttribute('hidden', ''), 320);
  }

  menuBtn?.addEventListener('click', () => {
    const expanded = menuBtn.getAttribute('aria-expanded') === 'true';
    if (expanded) closeDrawer();
    else openDrawer();
  });

  navLinks.forEach((link) => {
    link.addEventListener('click', () => closeDrawer());
  });

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  return {
    closeDrawer,
    onScroll,
    destroy: () => window.removeEventListener('scroll', onScroll),
  };
}

/**
 * @param {HTMLElement} root
 * @param {ReturnType<import('./i18n.js').createI18n>} i18n
 */
export function bindNewsletter(root, i18n) {
  const form = root.querySelector('[data-newsletter]');
  if (!form) return;

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const input = form.querySelector('input[type="email"]');
    if (!input?.value) return;

    const btn = form.querySelector('button[type="submit"]');
    const original = btn?.textContent ?? i18n.t('newsletter.submit');
    if (btn) {
      btn.textContent = i18n.t('newsletter.welcome');
      btn.disabled = true;
    }
    input.value = '';

    setTimeout(() => {
      if (btn) {
        btn.textContent = original;
        btn.disabled = false;
      }
    }, 3000);
  });
}

/**
 * @param {HTMLElement} root
 * @param {Array} allProducts
 * @param {function} onFilter
 */
export function bindFilters(root, allProducts, onFilter) {
  const filtersEl = root.querySelector('[data-filters]');
  if (!filtersEl) return;

  filtersEl.addEventListener('click', (event) => {
    const chip = event.target.closest('[data-filter]');
    if (!chip) return;

    filtersEl.querySelectorAll('.filter-chip').forEach((c) => c.classList.remove('is-active'));
    chip.classList.add('is-active');

    const filter = chip.dataset.filter ?? 'All';
    onFilter(filter);
  });
}
