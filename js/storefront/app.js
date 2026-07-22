/**
 * Shamaadan Luxury Storefront — orchestrator.
 * Catalog is loaded live from Supabase (same DB as Admin).
 */
import { isSupabaseConfigured } from '../../shared/supabase.js';
import { createI18n } from './i18n.js';
import { buildStorefrontHtml, productCardCartControlHtml } from './template.js';
import { loadProducts, filterProducts, renderProductGrid } from './products.js';
import { createCart, bindCartUI, showToast } from './cart.js';
import { initCheckout } from './checkout.js';
import { initNav, bindFilters } from './nav.js';
import { syncLangToggle, handleLangClick } from './lang.js';
import { initSmoothScroll, syncScrollTrigger, getLenis } from './scroll.js';
import { initAnimations, animateProductGrid } from './animations.js';

/**
 * @param {HTMLElement} root
 */
export async function mount(root) {
  const i18n = createI18n();

  let products = [];
  let categories = [];
  let collections = [];

  try {
    const catalog = await loadProducts();
    products = catalog.products;
    categories = catalog.categories;
    collections = catalog.collections;

    if (!catalog.connected && !isSupabaseConfigured()) {
      console.warn('[storefront] Supabase credentials missing — empty shop');
    }
  } catch (err) {
    console.error('[storefront] catalog load failed:', err);
    root.className = 'shop';
    root.innerHTML = `
      <div class="boot-error" role="alert" style="padding:3rem;text-align:center">
        <h1>Unable to load the shop</h1>
        <p>${err?.message || 'Failed to load products from Supabase.'}</p>
        <button type="button" onclick="location.reload()">Retry</button>
      </div>
    `;
    return;
  }

  const cart = createCart();
  cart.reconcile(products);
  const checkout = initCheckout(root, cart, i18n);

  let activeFilter = 'All';
  let lenis = null;
  let navApi = null;

  root.className = 'shop';
  document.body.style.background = '#181510';
  document.documentElement.style.colorScheme = 'dark';

  function cartQtyMap() {
    /** @type {Map<string, number>} */
    const map = new Map();
    for (const { product, qty } of cart.getSnapshot().items) {
      map.set(String(product.id), qty);
    }
    return map;
  }

  function syncCardCartControls() {
    const qtys = cartQtyMap();
    root.querySelectorAll('[data-card-cart]').forEach((host) => {
      const id = host.getAttribute('data-card-cart');
      if (!id) return;
      const card = host.closest('[data-stock]');
      const stock = Number(card?.getAttribute('data-stock') || 0);
      const qty = qtys.get(String(id)) || 0;
      const html = productCardCartControlHtml(id, qty, stock <= 0, i18n);
      if (host.innerHTML !== html) host.innerHTML = html;
    });
  }

  function applyFilter(filter) {
    activeFilter = filter || 'All';
    const gridEl = root.querySelector('[data-product-grid]');
    const filtered = filterProducts(products, activeFilter);
    renderProductGrid(gridEl, filtered, i18n, cartQtyMap());
    animateProductGrid(gridEl);

    root.querySelectorAll('.filter-chip').forEach((chip) => {
      chip.classList.toggle('is-active', chip.dataset.filter === activeFilter);
    });
  }

  function bindInteractions() {
    if (navApi?.destroy) navApi.destroy();

    bindCartUI(root, cart);
    navApi = initNav(root, i18n);
    syncLangToggle(root, i18n);
    checkout.refresh();
    syncCardCartControls();

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
        setTimeout(() => applyFilter(name), 0);
      }
      return;
    }

    const minus = event.target.closest('[data-action="card-qty-minus"]');
    if (minus) {
      const id = minus.dataset.productId;
      const line = cart.getSnapshot().items.find((i) => String(i.product.id) === String(id));
      if (!line) return;
      cart.updateQty(id, line.qty - 1);
      return;
    }

    const plus = event.target.closest('[data-action="card-qty-plus"]');
    if (plus) {
      const id = plus.dataset.productId;
      const product = products.find((p) => String(p.id) === String(id));
      const line = cart.getSnapshot().items.find((i) => String(i.product.id) === String(id));
      if (!product || !line) return;
      const stock = Number(product.stockQuantity ?? product.stock ?? product.stock_quantity ?? 0);
      if (line.qty >= stock) {
        showToast(root, i18n.t('shop.maxStock', { count: stock }));
        return;
      }
      cart.updateQty(id, line.qty + 1);
      return;
    }

    const btn = event.target.closest('[data-action="add-to-cart"]');
    if (!btn || btn.disabled) return;

    const id = btn.dataset.productId;
    const product = products.find((p) => String(p.id) === String(id));
    if (!product) return;

    const stock = Number(product.stockQuantity ?? product.stock ?? product.stock_quantity ?? 0);
    if (stock <= 0) {
      showToast(root, i18n.t('shop.outOfStock'));
      return;
    }

    const display = i18n.translateProduct(product);
    const result = cart.add(product);

    if (!result.added) {
      showToast(
        root,
        result.reason === 'max_stock'
          ? i18n.t('shop.maxStock', { count: stock })
          : i18n.t('shop.outOfStock'),
      );
      return;
    }

    showToast(root, i18n.t('shop.addedToast', { name: display.displayName }));
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
  cart.subscribe(() => {
    syncCardCartControls();
    checkout.refresh();
  });

  root.innerHTML = buildStorefrontHtml({ products, categories, collections, i18n });
  i18n.applyToDocument(root);
  bindInteractions();

  lenis = await initSmoothScroll();
  syncScrollTrigger(lenis);

  requestAnimationFrame(() => {
    initAnimations(root, lenis);
  });

  startCatalogAutoRefresh();

  function catalogSignature(list) {
    return (list || [])
      .map((p) => `${p.id}:${p.price}:${p.stockQuantity ?? p.stock_quantity ?? p.stock ?? ''}`)
      .join('|');
  }

  function startCatalogAutoRefresh() {
    let lastSignature = catalogSignature(products);
    const AUTO_REFRESH_MS = 30_000;

    window.setInterval(async () => {
      if (document.hidden) return;
      try {
        const catalog = await loadProducts();
        const nextSignature = catalogSignature(catalog.products);

        products = catalog.products;
        categories = catalog.categories;
        collections = catalog.collections;
        cart.reconcile(products);

        // Only re-render the grid when the catalog actually changed.
        if (nextSignature !== lastSignature) {
          lastSignature = nextSignature;
          applyFilter(activeFilter);
        }
      } catch (err) {
        console.warn('[storefront] auto-refresh skipped:', err?.message || err);
      }
    }, AUTO_REFRESH_MS);
  }
}
