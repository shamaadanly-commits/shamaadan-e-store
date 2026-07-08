/**
 * Shamaadan Luxury Storefront — orchestrator.
 */
import { createI18n } from './i18n.js';
import { buildStorefrontHtml } from './template.js';
import { loadProducts, filterProducts, renderProductGrid } from './products.js';
import { createCart, bindCartUI, showToast } from './cart.js';
import { initNav, bindNewsletter, bindFilters } from './nav.js';
import { syncLangToggle, handleLangClick } from './lang.js';
import { initSmoothScroll, syncScrollTrigger, getLenis } from './scroll.js';
import { initAnimations, animateProductGrid } from './animations.js';

/**
 * @param {HTMLElement} root
 */
export async function mount(root) {
  const i18n = createI18n();
  const { products, categories } = await loadProducts();
  const cart = createCart();

  let activeFilter = 'All';
  let lenis = null;
  let navApi = null;

  root.className = 'shop';
  document.body.style.background = '#181510';
  document.documentElement.style.colorScheme = 'dark';

  function bindInteractions() {
    if (navApi?.destroy) navApi.destroy();

    bindCartUI(root, cart);
    navApi = initNav(root, i18n);
    bindNewsletter(root, i18n);
    syncLangToggle(root, i18n);

    const gridEl = root.querySelector('[data-product-grid]');

    bindFilters(root, products, (filter) => {
      activeFilter = filter;
      const filtered = filterProducts(products, filter);
      renderProductGrid(gridEl, filtered, i18n);
      animateProductGrid(gridEl);
    });
  }

  function onRootClick(event) {
    if (handleLangClick(event.target, i18n)) {
      event.preventDefault();
      event.stopPropagation();
      rerender();
      return;
    }

    const btn = event.target.closest('[data-action="add-to-cart"]');
    if (!btn) return;

    const id = btn.dataset.productId;
    const product = products.find((p) => p.id === id);
    if (!product) return;

    const display = i18n.translateProduct(product);
    cart.add(product);
    showToast(root, i18n.t('shop.addedToast', { name: display.displayName }));

    const original = btn.textContent;
    btn.textContent = i18n.t('shop.added');
    btn.classList.add('is-added');
    btn.disabled = true;

    setTimeout(() => {
      btn.textContent = original;
      btn.classList.remove('is-added');
      btn.disabled = false;
    }, 1400);
  }

  function rerender() {
    const scrollY = window.scrollY;

    root.innerHTML = buildStorefrontHtml({ products, categories, i18n });
    i18n.applyToDocument(root);
    bindInteractions();

    const gridEl = root.querySelector('[data-product-grid]');
    const filtered = filterProducts(products, activeFilter);
    renderProductGrid(gridEl, filtered, i18n);

    const activeChip = root.querySelector(`[data-filter="${CSS.escape(activeFilter)}"]`);
    if (activeChip) {
      root.querySelectorAll('.filter-chip').forEach((c) => c.classList.remove('is-active'));
      activeChip.classList.add('is-active');
    }

    const currentLenis = getLenis();
    if (currentLenis) {
      currentLenis.scrollTo(scrollY, { immediate: true });
    } else {
      window.scrollTo(0, scrollY);
    }

    requestAnimationFrame(() => {
      initAnimations(root, getLenis());
    });
  }

  root.addEventListener('click', onRootClick);

  root.innerHTML = buildStorefrontHtml({ products, categories, i18n });
  i18n.applyToDocument(root);
  bindInteractions();

  lenis = await initSmoothScroll();
  syncScrollTrigger(lenis);

  requestAnimationFrame(() => {
    initAnimations(root, lenis);
  });
}
