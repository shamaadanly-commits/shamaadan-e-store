/**
 * Semantic HTML template for the luxury storefront.
 */
import { logoImg } from '../shared/brand.js';

const COLLECTION_GRADIENTS = [
  'linear-gradient(160deg, #2a1f14 0%, #1c1914 60%, #242019 100%)',
  'linear-gradient(200deg, #1a1814 0%, #2a2018 50%, #1c1914 100%)',
  'linear-gradient(140deg, #1e1a10 0%, #3a2a18 40%, #1c1914 100%)',
  'linear-gradient(180deg, #241a10 0%, #1c1914 100%)',
  'linear-gradient(160deg, #1a2018 0%, #1c1914 100%)',
  'linear-gradient(200deg, #201a14 0%, #1c1914 100%)',
];

const CATEGORY_GRADIENTS = {
  Candles: 'linear-gradient(160deg, #2a2620, #1c1914)',
  Diffusers: 'linear-gradient(160deg, #1a2018, #1c1914)',
  Incense: 'linear-gradient(160deg, #201a14, #1c1914)',
  Sprays: 'linear-gradient(160deg, #1a1814, #12100e)',
  Sets: 'linear-gradient(160deg, #2a2018, #1c1914)',
  'Gift Sets': 'linear-gradient(160deg, #2a2018, #1c1914)',
  Bakhoor: 'linear-gradient(160deg, #241a10, #1c1914)',
  Accessories: 'linear-gradient(160deg, #1a1a1a, #1c1914)',
  Oils: 'linear-gradient(160deg, #2a2210, #1c1914)',
  General: 'linear-gradient(160deg, #1e1a16, #1c1914)',
};

/**
 * @param {object} opts
 * @param {Array} opts.products
 * @param {string[]} opts.categories
 * @param {Array} [opts.collections]
 * @param {ReturnType<import('./i18n.js').createI18n>} opts.i18n
 */
export function buildStorefrontHtml({ products, categories, collections = [], i18n }) {
  const t = i18n.t.bind(i18n);
  const year = new Date().getFullYear();
  const categoryChips = ['All', ...categories];
  const marqueeItems = t('marquee');
  const collectionCards = collections.length
    ? collections.map((c, i) => ({
      ...c,
      gradient: c.gradient || COLLECTION_GRADIENTS[i % COLLECTION_GRADIENTS.length],
    }))
    : categories.slice(0, 6).map((name, i) => ({
      id: name.toLowerCase().replace(/\s+/g, '-'),
      name,
      count: products.filter((p) => p.category === name).length,
      gradient: COLLECTION_GRADIENTS[i % COLLECTION_GRADIENTS.length],
    }));

  return `
    <a href="#main-content" class="shop__skip">${t('skip')}</a>

    <header class="shop-header" role="banner" data-header>
      <div class="shop-header__inner">
        <a href="/" class="shop-header__logo" aria-label="${t('nav.home')}">
          ${logoImg({ className: 'shop-header__logo-img', size: 'header', loading: 'eager' })}
        </a>

        <nav class="shop-nav" aria-label="${t('nav.primary')}" data-nav>
          <a href="#collections" data-nav-link>${t('nav.collections')}</a>
          <a href="#shop" data-nav-link>${t('nav.shop')}</a>
          <a href="#ritual" data-nav-link>${t('nav.ritual')}</a>
          <a href="#contact" data-nav-link>${t('nav.contact')}</a>
        </nav>

        <div class="shop-header__actions">
          <div class="shop-header__lang" data-lang-toggle role="group" aria-label="${t('nav.switchLang')}">
            <button type="button" class="shop-header__lang-btn" data-lang-option="en" aria-pressed="false">${t('lang.en')}</button>
            <span class="shop-header__lang-divider" aria-hidden="true">|</span>
            <button type="button" class="shop-header__lang-btn" data-lang-option="ar" aria-pressed="false">${t('lang.ar')}</button>
          </div>

          <button type="button" class="shop-header__cart" aria-label="${t('nav.cart')}" data-cart-toggle>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
              <path d="M6 6h15l-1.5 9h-12z"/><path d="M6 6l-1-3H2"/><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/>
            </svg>
            <span class="shop-header__cart-count" data-cart-count aria-live="polite">0</span>
          </button>

          <button type="button" class="shop-header__menu-btn" aria-label="${t('nav.openMenu')}" aria-expanded="false" data-menu-toggle>
            <span></span><span></span><span></span>
          </button>
        </div>
      </div>
    </header>

    <nav class="shop-nav-drawer" aria-label="${t('nav.mobile')}" data-nav-drawer hidden>
      <a href="#collections" data-nav-link>${t('nav.collections')}</a>
      <a href="#shop" data-nav-link>${t('nav.shop')}</a>
      <a href="#ritual" data-nav-link>${t('nav.ritual')}</a>
      <a href="#contact" data-nav-link>${t('nav.contact')}</a>
    </nav>

    <main id="main-content">
      <section class="hero" aria-labelledby="hero-heading">
        <div class="hero__bg" aria-hidden="true">
          <div class="hero__gradient"></div>
          <div class="hero__grain"></div>
          <div class="hero__logo-mark">${logoImg({ className: 'hero__logo-img', size: 'hero', alt: '', loading: 'eager' })}</div>
          <div class="hero__orb hero__orb--1" data-parallax="0.15"></div>
          <div class="hero__orb hero__orb--2" data-parallax="0.25"></div>
        </div>

        <div class="hero__content">
          <p class="hero__eyebrow" data-animate="fade-up">${t('hero.eyebrow')}</p>
          <h1 class="hero__title" id="hero-heading" data-animate="fade-up" data-delay="0.1">${t('hero.title')}</h1>
          <p class="hero__desc" data-animate="fade-up" data-delay="0.2">${t('hero.desc')}</p>
          <div class="hero__actions" data-animate="fade-up" data-delay="0.3">
            <a href="#shop" class="btn btn--primary">${t('hero.ctaShop')}</a>
            <a href="#ritual" class="btn btn--ghost">${t('hero.ctaRitual')}</a>
          </div>
          <div class="hero__stats" data-animate="fade-up" data-delay="0.4">
            <div class="hero__stat">
              <span class="hero__stat-value">40+</span>
              <span class="hero__stat-label">${t('hero.statScents')}</span>
            </div>
            <div class="hero__stat">
              <span class="hero__stat-value">100%</span>
              <span class="hero__stat-label">${t('hero.statOils')}</span>
            </div>
            <div class="hero__stat">
              <span class="hero__stat-value">4.9</span>
              <span class="hero__stat-label">${t('hero.statRating')}</span>
            </div>
          </div>
        </div>

        <div class="hero__scroll-hint" aria-hidden="true" data-animate="fade" data-delay="0.8">
          <span>${t('hero.scroll')}</span>
          <div class="hero__scroll-line"></div>
        </div>
      </section>

      <section class="shop__section shop-products shop__section--tight" id="shop" aria-labelledby="shop-heading">
        <div class="shop__container">
          <div class="shop__section-header">
            <p class="shop__eyebrow">${t('shop.eyebrow')}</p>
            <h2 class="shop__title" id="shop-heading">${t('shop.title')}</h2>
            <p class="shop__lead">${t('shop.lead')}</p>
          </div>

          <div class="shop-products__filters" role="group" aria-label="${t('shop.filterLabel')}" data-filters>
            ${categoryChips.map((cat, i) => `
              <button type="button" class="filter-chip${i === 0 ? ' is-active' : ''}" data-filter="${escapeAttr(cat)}">${escapeHtml(i18n.translateCategory(cat))}</button>
            `).join('')}
          </div>

          <div class="shop__grid-products" data-product-grid role="list">
            ${products.map((p) => productCardHtml(p, i18n)).join('')}
          </div>
        </div>
      </section>

      <div class="marquee" aria-hidden="true">
        <div class="marquee__track">
          ${marqueeHtml(marqueeItems)}
          ${marqueeHtml(marqueeItems)}
        </div>
      </div>

      <section class="shop__section ethos" id="about" aria-labelledby="ethos-heading">
        <div class="shop__container">
          <div class="ethos__grid">
            <div class="ethos__visual" data-animate="${i18n.isRtl() ? 'fade-left' : 'fade-right'}">
              <div class="ethos__visual-bg"></div>
              <div class="ethos__visual-accent">
                <p class="ethos__visual-text">${t('ethos.quote')}</p>
              </div>
            </div>
            <div data-animate="${i18n.isRtl() ? 'fade-right' : 'fade-left'}">
              <p class="shop__eyebrow">${t('ethos.eyebrow')}</p>
              <h2 class="shop__title" id="ethos-heading">${t('ethos.title')}</h2>
              <hr class="shop__divider">
              <p class="shop__lead">${t('ethos.lead')}</p>
              <div class="ethos__pillars">
                <div class="ethos__pillar">
                  <span class="ethos__pillar-num">01</span>
                  <div>
                    <h3>${t('ethos.p1Title')}</h3>
                    <p>${t('ethos.p1Desc')}</p>
                  </div>
                </div>
                <div class="ethos__pillar">
                  <span class="ethos__pillar-num">02</span>
                  <div>
                    <h3>${t('ethos.p2Title')}</h3>
                    <p>${t('ethos.p2Desc')}</p>
                  </div>
                </div>
                <div class="ethos__pillar">
                  <span class="ethos__pillar-num">03</span>
                  <div>
                    <h3>${t('ethos.p3Title')}</h3>
                    <p>${t('ethos.p3Desc')}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="shop__section collections" id="collections" aria-labelledby="collections-heading">
        <div class="shop__container">
          <div class="shop__section-header shop__section-header--row">
            <div>
              <p class="shop__eyebrow">${t('collections.eyebrow')}</p>
              <h2 class="shop__title" id="collections-heading">${t('collections.title')}</h2>
            </div>
            <a href="#shop" class="btn btn--ghost btn--sm">${t('collections.viewAll')}</a>
          </div>
          <div class="shop__grid-3" data-animate="stagger-grid">
            ${collectionCards.map((c) => collectionCardHtml(c, i18n)).join('')}
          </div>
        </div>
      </section>

      <section class="shop__section ritual" id="ritual" aria-labelledby="ritual-heading">
        <div class="shop__container">
          <div class="ritual__inner" data-animate="fade-up">
            <div>
              <p class="shop__eyebrow">${t('ritual.eyebrow')}</p>
              <h2 class="shop__title" id="ritual-heading">${t('ritual.title')}</h2>
              <hr class="shop__divider">
              <p class="shop__lead">${t('ritual.lead')}</p>
              <div class="ritual__steps">
                <div class="ritual__step">
                  <span class="ritual__step-icon">I</span>
                  <div>
                    <h4>${t('ritual.s1Title')}</h4>
                    <p>${t('ritual.s1Desc')}</p>
                  </div>
                </div>
                <div class="ritual__step">
                  <span class="ritual__step-icon">II</span>
                  <div>
                    <h4>${t('ritual.s2Title')}</h4>
                    <p>${t('ritual.s2Desc')}</p>
                  </div>
                </div>
                <div class="ritual__step">
                  <span class="ritual__step-icon">III</span>
                  <div>
                    <h4>${t('ritual.s3Title')}</h4>
                    <p>${t('ritual.s3Desc')}</p>
                  </div>
                </div>
              </div>
            </div>
            <div class="ritual__visual" aria-hidden="true">
              <div class="ritual__visual-bg"></div>
              <div class="ritual__visual-ring"></div>
              <div class="ritual__visual-center">
                ${logoImg({ className: 'ritual__logo-img', size: 'ritual', alt: '' })}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="shop__section newsletter" id="contact" aria-labelledby="contact-heading">
        <div class="shop__container">
          <div class="newsletter__box" data-animate="fade-up">
            <p class="shop__eyebrow">${t('newsletter.eyebrow')}</p>
            <h2 class="shop__title" id="contact-heading">${t('newsletter.title')}</h2>
            <p class="shop__lead" style="margin-inline:auto">${t('newsletter.lead')}</p>
            <form class="newsletter__form" data-newsletter novalidate>
              <input type="email" class="newsletter__input" placeholder="${t('newsletter.placeholder')}" aria-label="${t('newsletter.emailLabel')}" required>
              <button type="submit" class="btn btn--primary">${t('newsletter.submit')}</button>
            </form>
          </div>
        </div>
      </section>
    </main>

    <footer class="shop-footer" role="contentinfo">
      <div class="shop__container">
        <div class="shop-footer__grid">
          <div>
            <a href="/" class="shop-footer__brand" aria-label="${t('nav.home')}">
              ${logoImg({ className: 'shop-footer__logo-img', size: 'footer' })}
            </a>
            <p class="shop-footer__tagline">${t('footer.tagline')}</p>
            <div class="shop-footer__social">
              <a href="#" aria-label="${t('footer.instagram')}">IG</a>
              <a href="#" aria-label="${t('footer.tiktok')}">TK</a>
              <a href="#" aria-label="${t('footer.pinterest')}">PI</a>
            </div>
          </div>
          <div class="shop-footer__col">
            <h4>${t('footer.shop')}</h4>
            <ul>
              <li><a href="#shop">${t('footer.allProducts')}</a></li>
              <li><a href="#collections">${t('nav.collections')}</a></li>
              <li><a href="#shop">${t('footer.giftSets')}</a></li>
              <li><a href="#shop">${t('footer.newArrivals')}</a></li>
            </ul>
          </div>
          <div class="shop-footer__col">
            <h4>${t('footer.house')}</h4>
            <ul>
              <li><a href="#about">${t('footer.ourStory')}</a></li>
              <li><a href="#ritual">${t('footer.theRitual')}</a></li>
              <li><a href="#">${t('footer.sustainability')}</a></li>
              <li><a href="#">${t('footer.stockists')}</a></li>
            </ul>
          </div>
          <div class="shop-footer__col">
            <h4>${t('footer.support')}</h4>
            <ul>
              <li><a href="#">${t('footer.shipping')}</a></li>
              <li><a href="#">${t('footer.returns')}</a></li>
              <li><a href="#contact">${t('nav.contact')}</a></li>
              <li><a href="#">${t('footer.faq')}</a></li>
            </ul>
          </div>
        </div>
        <div class="shop-footer__bottom">
          <span>&copy; ${year} Shamaadan. ${t('footer.rights')}</span>
          <span>${t('footer.crafted')}</span>
        </div>
      </div>
    </footer>

    <div class="shop-toast" role="status" aria-live="polite" data-toast>
      <span class="shop-toast__icon" aria-hidden="true">✦</span>
      <span data-toast-message></span>
    </div>
  `;
}

export function productCardHtml(product, i18n) {
  const t = i18n.t.bind(i18n);
  const display = i18n.translateProduct(product);
  const gradient = CATEGORY_GRADIENTS[product.category] || CATEGORY_GRADIENTS.General;
  const initial = display.displayName.charAt(0);
  const imageUrl = product.imageUrls?.[0] || product.image || null;

  const stock = Number(
    product.stockQuantity ?? product.stock_quantity ?? product.stock ?? 0,
  );
  const alertAt = Number(product.minStockAlert ?? product.min_stock_alert ?? 5);
  const outOfStock = stock <= 0;
  const lowStock = !outOfStock && (stock === 1 || stock <= alertAt);

  let badge = '';
  if (outOfStock) {
    badge = `<span class="inventory-badge out-of-stock">${t('shop.outOfStock')}</span>`;
  } else if (stock === 1) {
    badge = `<span class="inventory-badge low-stock">${t('shop.onlyOneLeft')}</span>`;
  } else if (lowStock) {
    badge = `<span class="inventory-badge low-stock">${t('shop.lowStock', { count: stock })}</span>`;
  }

  const media = imageUrl
    ? `<img class="product-card__image" src="${escapeAttr(imageUrl)}" alt="${escapeAttr(display.displayName)}" loading="lazy" decoding="async">`
    : `<span class="product-card__monogram" aria-hidden="true">${escapeHtml(initial)}</span>`;

  const addButtons = outOfStock
    ? `
        <button type="button" class="btn btn--copper btn--sm add-to-cart-btn" disabled aria-disabled="true">${t('shop.outOfStock')}</button>
      `
    : `
        <button type="button" class="btn btn--copper btn--sm add-to-cart-btn" data-action="add-to-cart" data-product-id="${product.id}">${t('shop.add')}</button>
      `;

  const bagButton = outOfStock
    ? `<button type="button" class="btn btn--ghost btn--sm add-to-cart-btn" disabled aria-disabled="true">${t('shop.outOfStock')}</button>`
    : `<button type="button" class="btn btn--ghost btn--sm add-to-cart-btn" data-action="add-to-cart" data-product-id="${product.id}">${t('shop.bag')}</button>`;

  return `
    <article
      class="product-card${outOfStock ? ' product-card--oos' : ''}${lowStock ? ' product-card--low' : ''}"
      role="listitem"
      data-product-id="${product.id}"
      data-stock="${stock}"
      style="--card-gradient: ${gradient}"
    >
      <div class="product-card__media">
        <div class="product-card__visual${imageUrl ? ' product-card__visual--photo' : ''}">
          ${media}
        </div>
        <div class="product-card__shine" aria-hidden="true"></div>
        ${badge}
        <div class="product-card__quick-add">
          ${addButtons}
        </div>
      </div>
      <div class="product-card__body">
        <p class="product-card__category">${escapeHtml(display.displayCategory)}</p>
        <h3 class="product-card__name">${escapeHtml(display.displayName)}</h3>
        ${outOfStock ? `<p class="product-card__stock-note product-card__stock-note--oos">${t('shop.outOfStock')}</p>` : ''}
        ${lowStock && !outOfStock ? `<p class="product-card__stock-note">${stock === 1 ? t('shop.onlyOneLeft') : t('shop.lowStock', { count: stock })}</p>` : ''}
        <div class="product-card__footer">
          <span class="product-card__price" data-price="${product.price}">${i18n.formatPrice(product.price)}</span>
          ${bagButton}
        </div>
      </div>
    </article>
  `;
}

function collectionCardHtml(collection, i18n) {
  const t = i18n.t.bind(i18n);
  const name = collection.name || i18n.translateCollection(collection.id);
  const filterName = collection.name || collection.id;

  return `
    <a href="#shop" class="collection-card" data-collection="${escapeAttr(filterName)}">
      <div class="collection-card__bg" style="--collection-gradient: ${collection.gradient}"></div>
      <div class="collection-card__overlay"></div>
      <div class="collection-card__content">
        <p class="collection-card__count">${collection.count} ${t('collections.pieces')}</p>
        <h3 class="collection-card__name">${escapeHtml(name)}</h3>
        <span class="collection-card__link">${t('collections.explore')} <span aria-hidden="true">→</span></span>
      </div>
    </a>
  `;
}

function marqueeHtml(items) {
  const list = Array.isArray(items) ? items : [];
  return `
    <div class="marquee__content">
      ${list.map((item) => `
        <span class="marquee__item"><span class="marquee__dot"></span>${escapeHtml(item)}</span>
      `).join('')}
    </div>
  `;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/"/g, '&quot;');
}

export { CATEGORY_GRADIENTS, COLLECTION_GRADIENTS };
