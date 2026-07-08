/**
 * Semantic HTML template for the luxury storefront.
 */
import { logoImg } from '../shared/brand.js';

const MARQUEE_ITEMS = [
  'Free shipping over $75',
  'Hand-poured in small batches',
  'Sustainably sourced oud',
  'Complimentary gift wrapping',
  'Same-day Dubai delivery',
];

const COLLECTIONS = [
  {
    id: 'candles',
    name: 'Signature Candles',
    count: 12,
    gradient: 'linear-gradient(160deg, #2a1f14 0%, #0d0b09 60%, #1a1510 100%)',
  },
  {
    id: 'incense',
    name: 'Incense & Bakhoor',
    count: 18,
    gradient: 'linear-gradient(200deg, #1a1814 0%, #2a2018 50%, #0d0b09 100%)',
  },
  {
    id: 'oils',
    name: 'Attars & Oils',
    count: 9,
    gradient: 'linear-gradient(140deg, #1e1a10 0%, #3a2a18 40%, #0d0b09 100%)',
  },
];

const CATEGORY_GRADIENTS = {
  Candles: 'linear-gradient(160deg, #2a1f14, #0d0b09)',
  Diffusers: 'linear-gradient(160deg, #1a2018, #0d0b09)',
  Incense: 'linear-gradient(160deg, #201a14, #0d0b09)',
  Sprays: 'linear-gradient(160deg, #1a1814, #12100e)',
  Sets: 'linear-gradient(160deg, #2a2018, #0d0b09)',
  Bakhoor: 'linear-gradient(160deg, #241a10, #0d0b09)',
  Accessories: 'linear-gradient(160deg, #1a1a1a, #0d0b09)',
  Oils: 'linear-gradient(160deg, #2a2210, #0d0b09)',
  General: 'linear-gradient(160deg, #1e1a16, #0d0b09)',
};

/**
 * @param {object} opts
 * @param {Array} opts.products
 * @param {string[]} opts.categories
 */
export function buildStorefrontHtml({ products, categories }) {
  const year = new Date().getFullYear();
  const categoryChips = ['All', ...categories];

  return `
    <a href="#main-content" class="shop__skip">Skip to content</a>

    <header class="shop-header" role="banner" data-header>
      <div class="shop-header__inner">
        <a href="/" class="shop-header__logo" aria-label="Shamaadan home">
          ${logoImg({ className: 'shop-header__logo-img', size: 'header', loading: 'eager' })}
        </a>

        <nav class="shop-nav" aria-label="Primary" data-nav>
          <a href="#collections" data-nav-link>Collections</a>
          <a href="#shop" data-nav-link>Shop</a>
          <a href="#ritual" data-nav-link>Ritual</a>
          <a href="#contact" data-nav-link>Contact</a>
        </nav>

        <div class="shop-header__actions">
          <button type="button" class="shop-header__cart" aria-label="Shopping bag" data-cart-toggle>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
              <path d="M6 6h15l-1.5 9h-12z"/><path d="M6 6l-1-3H2"/><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/>
            </svg>
            <span class="shop-header__cart-count" data-cart-count aria-live="polite">0</span>
          </button>

          <button type="button" class="shop-header__menu-btn" aria-label="Open menu" aria-expanded="false" data-menu-toggle>
            <span></span><span></span><span></span>
          </button>
        </div>
      </div>
    </header>

    <nav class="shop-nav-drawer" aria-label="Mobile" data-nav-drawer hidden>
      <a href="#collections" data-nav-link>Collections</a>
      <a href="#shop" data-nav-link>Shop</a>
      <a href="#ritual" data-nav-link>Ritual</a>
      <a href="#contact" data-nav-link>Contact</a>
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
          <p class="hero__eyebrow" data-animate="fade-up">Luxury fragrance house</p>
          <h1 class="hero__title" id="hero-heading" data-animate="fade-up" data-delay="0.1">
            Scent as <em>ritual</em>
          </h1>
          <p class="hero__desc" data-animate="fade-up" data-delay="0.2">
            Hand-crafted oud, incense, and candles — composed for those who treat every evening as a ceremony.
          </p>
          <div class="hero__actions" data-animate="fade-up" data-delay="0.3">
            <a href="#shop" class="btn btn--primary">Shop Collection</a>
            <a href="#ritual" class="btn btn--ghost">Our Ritual</a>
          </div>
          <div class="hero__stats" data-animate="fade-up" data-delay="0.4">
            <div class="hero__stat">
              <span class="hero__stat-value">40+</span>
              <span class="hero__stat-label">Curated scents</span>
            </div>
            <div class="hero__stat">
              <span class="hero__stat-value">100%</span>
              <span class="hero__stat-label">Natural oils</span>
            </div>
            <div class="hero__stat">
              <span class="hero__stat-value">4.9</span>
              <span class="hero__stat-label">Customer rating</span>
            </div>
          </div>
        </div>

        <div class="hero__scroll-hint" aria-hidden="true" data-animate="fade" data-delay="0.8">
          <span>Scroll</span>
          <div class="hero__scroll-line"></div>
        </div>
      </section>

      <div class="marquee" aria-hidden="true">
        <div class="marquee__track">
          ${marqueeHtml()}
          ${marqueeHtml()}
        </div>
      </div>

      <section class="shop__section ethos" id="about" aria-labelledby="ethos-heading">
        <div class="shop__container">
          <div class="ethos__grid">
            <div class="ethos__visual" data-animate="fade-right">
              <div class="ethos__visual-bg"></div>
              <div class="ethos__visual-accent">
                <p class="ethos__visual-text">"Every flame<br>is an invitation<br>to pause."</p>
              </div>
            </div>
            <div data-animate="fade-left">
              <p class="shop__eyebrow">Our ethos</p>
              <h2 class="shop__title" id="ethos-heading">Crafted with intention</h2>
              <hr class="shop__divider">
              <p class="shop__lead">
                Shamaadan sources rare oud, amber, and rose taif from trusted ateliers across the Gulf —
                blended in micro-batches to preserve depth and longevity.
              </p>
              <div class="ethos__pillars">
                <div class="ethos__pillar">
                  <span class="ethos__pillar-num">01</span>
                  <div>
                    <h3>Small-batch atelier</h3>
                    <p>Each product is poured, packed, and numbered by hand in our Dubai studio.</p>
                  </div>
                </div>
                <div class="ethos__pillar">
                  <span class="ethos__pillar-num">02</span>
                  <div>
                    <h3>Ethically sourced</h3>
                    <p>We partner directly with growers — no middlemen, no compromise on purity.</p>
                  </div>
                </div>
                <div class="ethos__pillar">
                  <span class="ethos__pillar-num">03</span>
                  <div>
                    <h3>Designed to linger</h3>
                    <p>Formulations built for throw, burn-time, and the slow unfurling of top notes.</p>
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
              <p class="shop__eyebrow">Curated for you</p>
              <h2 class="shop__title" id="collections-heading">Collections</h2>
            </div>
            <a href="#shop" class="btn btn--ghost btn--sm">View all</a>
          </div>
          <div class="shop__grid-3" data-animate="stagger-grid">
            ${COLLECTIONS.map((c) => collectionCardHtml(c)).join('')}
          </div>
        </div>
      </section>

      <section class="shop__section shop-products" id="shop" aria-labelledby="shop-heading">
        <div class="shop__container">
          <div class="shop__section-header">
            <p class="shop__eyebrow">The boutique</p>
            <h2 class="shop__title" id="shop-heading">Shop the edit</h2>
            <p class="shop__lead">Tap to add — complimentary gift wrapping on every order.</p>
          </div>

          <div class="shop-products__filters" role="group" aria-label="Filter by category" data-filters>
            ${categoryChips.map((cat, i) => `
              <button type="button" class="filter-chip${i === 0 ? ' is-active' : ''}" data-filter="${escapeAttr(cat)}">${escapeHtml(cat)}</button>
            `).join('')}
          </div>

          <div class="shop__grid-products" data-product-grid role="list">
            ${products.map((p) => productCardHtml(p)).join('')}
          </div>
        </div>
      </section>

      <section class="shop__section ritual" id="ritual" aria-labelledby="ritual-heading">
        <div class="shop__container">
          <div class="ritual__inner" data-animate="fade-up">
            <div>
              <p class="shop__eyebrow">The evening ritual</p>
              <h2 class="shop__title" id="ritual-heading">Three movements of scent</h2>
              <hr class="shop__divider">
              <p class="shop__lead">A guided sequence to transform your space from day to sanctuary.</p>
              <div class="ritual__steps">
                <div class="ritual__step">
                  <span class="ritual__step-icon">I</span>
                  <div>
                    <h4>Clear the air</h4>
                    <p>Light a sandalwood base to neutralize and open the room.</p>
                  </div>
                </div>
                <div class="ritual__step">
                  <span class="ritual__step-icon">II</span>
                  <div>
                    <h4>Layer the heart</h4>
                    <p>Add bakhoor or incense — let the middle notes bloom for ten minutes.</p>
                  </div>
                </div>
                <div class="ritual__step">
                  <span class="ritual__step-icon">III</span>
                  <div>
                    <h4>Seal with oud</h4>
                    <p>Finish with a single drop of attar on pulse points. The scent will anchor for hours.</p>
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
            <p class="shop__eyebrow">Stay in the circle</p>
            <h2 class="shop__title" id="contact-heading">Private releases &amp; rituals</h2>
            <p class="shop__lead" style="margin-inline:auto">
              Be first to discover limited editions, seasonal blends, and invitation-only events.
            </p>
            <form class="newsletter__form" data-newsletter novalidate>
              <input type="email" class="newsletter__input" placeholder="Your email address" aria-label="Email address" required>
              <button type="submit" class="btn btn--primary">Subscribe</button>
            </form>
          </div>
        </div>
      </section>
    </main>

    <footer class="shop-footer" role="contentinfo">
      <div class="shop__container">
        <div class="shop-footer__grid">
          <div>
            <a href="/" class="shop-footer__brand" aria-label="Shamaadan home">
              ${logoImg({ className: 'shop-footer__logo-img', size: 'footer' })}
            </a>
            <p class="shop-footer__tagline">Luxury fragrance &amp; home rituals — composed in Dubai, delivered worldwide.</p>
            <div class="shop-footer__social">
              <a href="#" aria-label="Instagram">IG</a>
              <a href="#" aria-label="TikTok">TK</a>
              <a href="#" aria-label="Pinterest">PI</a>
            </div>
          </div>
          <div class="shop-footer__col">
            <h4>Shop</h4>
            <ul>
              <li><a href="#shop">All products</a></li>
              <li><a href="#collections">Collections</a></li>
              <li><a href="#shop">Gift sets</a></li>
              <li><a href="#shop">New arrivals</a></li>
            </ul>
          </div>
          <div class="shop-footer__col">
            <h4>House</h4>
            <ul>
              <li><a href="#about">Our story</a></li>
              <li><a href="#ritual">The ritual</a></li>
              <li><a href="#">Sustainability</a></li>
              <li><a href="#">Stockists</a></li>
            </ul>
          </div>
          <div class="shop-footer__col">
            <h4>Support</h4>
            <ul>
              <li><a href="#">Shipping</a></li>
              <li><a href="#">Returns</a></li>
              <li><a href="#contact">Contact</a></li>
              <li><a href="#">FAQ</a></li>
            </ul>
          </div>
        </div>
        <div class="shop-footer__bottom">
          <span>&copy; ${year} Shamaadan. All rights reserved.</span>
          <span>Crafted with intention in Dubai</span>
        </div>
      </div>
    </footer>

    <div class="shop-toast" role="status" aria-live="polite" data-toast>
      <span class="shop-toast__icon" aria-hidden="true">✦</span>
      <span data-toast-message>Added to bag</span>
    </div>
  `;
}

export function productCardHtml(product) {
  const gradient = CATEGORY_GRADIENTS[product.category] || CATEGORY_GRADIENTS.General;
  const initial = product.name.charAt(0).toUpperCase();
  const isNew = product.id === 'p1' || product.id === 'p5';
  const badge = isNew ? '<span class="product-card__badge">New</span>' : '';

  return `
    <article class="product-card" role="listitem" data-product-id="${product.id}" style="--card-gradient: ${gradient}">
      <div class="product-card__media">
        <div class="product-card__visual">
          <span class="product-card__monogram" aria-hidden="true">${initial}</span>
        </div>
        <div class="product-card__shine" aria-hidden="true"></div>
        ${badge}
        <div class="product-card__quick-add">
          <button type="button" class="btn btn--copper btn--sm" data-action="add-to-cart" data-product-id="${product.id}">Add</button>
        </div>
      </div>
      <div class="product-card__body">
        <p class="product-card__category">${escapeHtml(product.category)}</p>
        <h3 class="product-card__name">${escapeHtml(product.name)}</h3>
        <div class="product-card__footer">
          <span class="product-card__price" data-price="${product.price}">${formatPrice(product.price)}</span>
          <button type="button" class="btn btn--ghost btn--sm" data-action="add-to-cart" data-product-id="${product.id}">+ Bag</button>
        </div>
      </div>
    </article>
  `;
}

function collectionCardHtml(collection) {
  return `
    <a href="#shop" class="collection-card" data-collection="${collection.id}">
      <div class="collection-card__bg" style="--collection-gradient: ${collection.gradient}"></div>
      <div class="collection-card__overlay"></div>
      <div class="collection-card__content">
        <p class="collection-card__count">${collection.count} pieces</p>
        <h3 class="collection-card__name">${escapeHtml(collection.name)}</h3>
        <span class="collection-card__link">Explore <span aria-hidden="true">→</span></span>
      </div>
    </a>
  `;
}

function marqueeHtml() {
  return `
    <div class="marquee__content">
      ${MARQUEE_ITEMS.map((item) => `
        <span class="marquee__item"><span class="marquee__dot"></span>${item}</span>
      `).join('')}
    </div>
  `;
}

function formatPrice(amount) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
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

export { COLLECTIONS, CATEGORY_GRADIENTS };
