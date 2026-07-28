/**
 * Shamaadan Luxury Storefront — orchestrator.
 * Catalog is loaded live from Supabase (same DB as Admin).
 */
import { isSupabaseConfigured } from '../../shared/supabase.js';
import { createI18n } from './i18n.js';
import { buildStorefrontHtml, productCardCartControlHtml, productDetailHtml } from './template.js';
import { loadProducts, filterProducts, renderProductGrid } from './products.js';
import { productGroupKey } from '../shared/catalog-store.js';
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
  /** @type {Map<string, string>} group key → selected product id */
  const selectedVariantByGroup = new Map();
  /** @type {string | null} */
  let openDetailProductId = null;

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
    root.querySelectorAll('[data-card-cart], [data-detail-cart]').forEach((host) => {
      const id = host.getAttribute('data-card-cart') || host.getAttribute('data-detail-cart');
      if (!id) return;
      const panel = host.closest('[data-stock]');
      const stock = Number(panel?.getAttribute('data-stock') || 0);
      const qty = qtys.get(String(id)) || 0;
      const html = productCardCartControlHtml(id, qty, stock <= 0, i18n);
      if (host.innerHTML !== html) host.innerHTML = html;
    });
  }

  function getDetailContext(productId) {
    const product = products.find((p) => String(p.id) === String(productId));
    if (!product) return null;
    const key = productGroupKey(product.title || product.name);
    const preferred = selectedVariantByGroup.get(key);
    const variants = products.filter(
      (p) => productGroupKey(p.title || p.name) === key,
    );
    const selected = (preferred && variants.find((v) => String(v.id) === String(preferred)))
      || variants.find((v) => String(v.id) === String(productId))
      || product;
    return { product: selected, variants, groupKey: key };
  }

  function closeProductDetail() {
    root.querySelector('[data-product-detail]')?.remove();
    openDetailProductId = null;
    document.body.classList.remove('product-detail-open');
  }

  function openProductDetail(productId) {
    const ctx = getDetailContext(productId);
    if (!ctx) return;

    selectedVariantByGroup.set(ctx.groupKey, String(ctx.product.id));
    root.querySelector('[data-product-detail]')?.remove();
    openDetailProductId = String(ctx.product.id);

    const qty = cartQtyMap().get(String(ctx.product.id)) || 0;
    root.insertAdjacentHTML(
      'beforeend',
      productDetailHtml({
        product: ctx.product,
        variants: ctx.variants,
        groupKey: ctx.groupKey,
        cartQty: qty,
        i18n,
      }),
    );
    document.body.classList.add('product-detail-open');
  }

  function refreshOpenProductDetail() {
    if (!openDetailProductId) return;
    openProductDetail(openDetailProductId);
  }

  function applyFilter(filter) {
    activeFilter = filter || 'All';
    const gridEl = root.querySelector('[data-product-grid]');
    const filtered = filterProducts(products, activeFilter);
    renderProductGrid(gridEl, filtered, i18n, cartQtyMap(), selectedVariantByGroup);
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

    if (event.target.closest('[data-close-product-detail]')) {
      closeProductDetail();
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

    const selectImage = event.target.closest('[data-action="select-image"], [data-action="detail-select-image"]');
    if (selectImage) {
      const url = selectImage.dataset.imageUrl;
      const scope = selectImage.closest('[data-card-gallery]')?.parentElement
        || selectImage.closest('[data-product-detail-panel]')
        || selectImage.closest('[data-product-id]');
      const main = scope?.querySelector('[data-card-main-image]');
      if (url && main) {
        main.src = url;
        (scope || root).querySelectorAll('[data-action="select-image"], [data-action="detail-select-image"]').forEach((thumb) => {
          if (!scope?.contains(thumb)) return;
          const active = thumb === selectImage;
          thumb.classList.toggle('is-active', active);
          thumb.setAttribute('aria-selected', active ? 'true' : 'false');
        });
      }
      return;
    }

    const selectVariant = event.target.closest('[data-action="select-variant"], [data-action="detail-select-variant"]');
    if (selectVariant) {
      const id = selectVariant.dataset.productId;
      const groupKey = selectVariant.dataset.groupKey;
      if (id && groupKey) {
        selectedVariantByGroup.set(groupKey, id);
        const inDetail = Boolean(selectVariant.closest('[data-product-detail]'));
        applyFilter(activeFilter);
        if (inDetail) {
          openDetailProductId = id;
          refreshOpenProductDetail();
        }
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
    if (btn) {
      if (btn.disabled) return;

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
      return;
    }

    const openCard = event.target.closest('[data-action="open-product"]');
    if (openCard) {
      const id = openCard.dataset.productId;
      if (id) openProductDetail(id);
    }
  }

  function onRootKeydown(event) {
    if (event.key === 'Escape' && openDetailProductId) {
      closeProductDetail();
      return;
    }
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const card = event.target.closest('[data-action="open-product"]');
    if (!card || event.target !== card) return;
    event.preventDefault();
    const id = card.dataset.productId;
    if (id) openProductDetail(id);
  }

  function rerender() {
    const scrollY = window.scrollY;
    const keepDetailId = openDetailProductId;

    root.innerHTML = buildStorefrontHtml({ products, categories, collections, i18n });
    i18n.applyToDocument(root);
    bindInteractions();

    applyFilter(activeFilter);
    if (keepDetailId) openProductDetail(keepDetailId);

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
  root.addEventListener('keydown', onRootKeydown);
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
