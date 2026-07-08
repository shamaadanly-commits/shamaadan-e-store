/**
 * Shamaadan Luxury Storefront — orchestrator.
 */
import { buildStorefrontHtml } from './template.js';
import { loadProducts, filterProducts, renderProductGrid } from './products.js';
import { createCart, bindCartUI, showToast } from './cart.js';
import { initNav, bindNewsletter, bindFilters } from './nav.js';
import { initSmoothScroll, syncScrollTrigger } from './scroll.js';
import { initAnimations, animateProductGrid } from './animations.js';

/**
 * @param {HTMLElement} root
 */
export async function mount(root) {
  const { products, categories } = await loadProducts();
  const cart = createCart();

  root.className = 'shop';
  document.body.style.background = '#0a0908';
  document.documentElement.style.colorScheme = 'dark';
  root.innerHTML = buildStorefrontHtml({ products, categories });

  bindCartUI(root, cart);
  initNav(root);
  bindNewsletter(root);

  const gridEl = root.querySelector('[data-product-grid]');
  let activeFilter = 'All';

  bindFilters(root, products, (filter) => {
    activeFilter = filter;
    const filtered = filterProducts(products, filter);
    renderProductGrid(gridEl, filtered);
    animateProductGrid(gridEl);
  });

  root.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-action="add-to-cart"]');
    if (!btn) return;

    const id = btn.dataset.productId;
    const product = products.find((p) => p.id === id);
    if (!product) return;

    cart.add(product);
    showToast(root, `${product.name} added to bag`);

    const original = btn.textContent;
    btn.textContent = 'Added ✦';
    btn.classList.add('is-added');
    btn.disabled = true;

    setTimeout(() => {
      btn.textContent = original;
      btn.classList.remove('is-added');
      btn.disabled = false;
    }, 1400);
  });

  const lenis = await initSmoothScroll();
  syncScrollTrigger(lenis);

  requestAnimationFrame(() => {
    initAnimations(root, lenis);
  });
}
