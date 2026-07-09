/**
 * Shamaadan Luxury Storefront — orchestrator.
 */
import { createI18n } from './i18n.js';
import { buildStorefrontHtml } from './template.js';
import { loadProducts, filterProducts, renderProductGrid } from './products.js';
import { createCart, bindCartUI, showToast } from './cart.js';
import { initCheckout } from './checkout.js';
import { initNav, bindNewsletter, bindFilters } from './nav.js';
import { syncLangToggle, handleLangClick } from './lang.js';
import { initSmoothScroll, syncScrollTrigger, getLenis } from './scroll.js';
import { initAnimations, animateProductGrid } from './animations.js';

/**
 * @param {HTMLElement} root
 */
export async function mount(root) {
  const i18n = createI18n();
  const { products, categories, collections } = await loadProducts();
  const cart = createCart();
  const checkout = initCheckout(root, cart, i18n);

  let activeFilter = 'All';
  let lenis = null;
  let navApi = null;

  root.className = 'shop';
  document.body.style.background = '#181510';
  document.documentElement.style.colorScheme = 'dark';

  function applyFilter(filter) {
    activeFilter = filter || 'All';
    const gridEl = root.querySelector('[data-product-grid]');
    const filtered = filterProducts(products, activeFilter);
    renderProductGrid(gridEl, filtered, i18n);
    animateProductGrid(gridEl);

    root.querySelectorAll('.filter-chip').forEach((chip) => {
      chip.classList.toggle('is-active', chip.dataset.filter === activeFilter);
    });
  }

  function bindInteractions() {
    if (navApi?.destroy) navApi.destroy();

    bindCartUI(root, cart);
    navApi = initNav(root, i18n);
    bindNewsletter(root, i18n);
    syncLangToggle(root, i18n);
    checkout.refresh();

    bindFilters(root, products, (filter) => applyFilter(filter));
  }

  function onRootClick(event) {
    if (event.target.closest('[data-cart-toggle]')) {
      event.preventDefault();
      checkout.open();
      return;
    }

    if (handleLangClick(event.target, i18n)) {
      event.preventDefault();
      event.stopPropagation();
      rerender();
      return;
    }

    const collectionLink = event.target.closest('[data-collection]');
    if (collectionLink) {
      const name = collectionLink.dataset.collection;
      if (name) {
        // Let hash navigation happen, then filter shop
        setTimeout(() => applyFilter(name), 0);
      }
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

    root.innerHTML = buildStorefrontHtml({ products, categories, collections, i18n });
    i18n.applyToDocument(root);
    bindInteractions();

    applyFilter(activeFilter);

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

  root.innerHTML = buildStorefrontHtml({ products, categories, collections, i18n });
  i18n.applyToDocument(root);
  bindInteractions();

  lenis = await initSmoothScroll();
  syncScrollTrigger(lenis);

  requestAnimationFrame(() => {
    initAnimations(root, lenis);
  });
}
