/**
 * Checkout drawer — CAD (cash on delivery) & UPAY (credit card).
 */
import { createOrder, getDeliveryRates, isSupabaseConfigured } from '../../shared/supabase.js';

const OVERLAY_ID = 'checkout-overlay';

/** @type {object[] | null} */
let cachedDeliveryRates = null;

/**
 * @param {HTMLElement} shopRoot
 * @param {ReturnType<import('./cart.js').createCart>} cart
 * @param {ReturnType<import('./i18n.js').createI18n>} i18n
 */
export function initCheckout(shopRoot, cart, i18n) {
  let overlay = document.getElementById(OVERLAY_ID);
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.className = 'checkout-overlay';
    overlay.innerHTML = buildShell();
    document.body.appendChild(overlay);
    bindOverlayEvents(overlay, cart, i18n);
  }

  cart.subscribe(() => {
    if (overlay.classList.contains('is-open')) {
      // Soft refresh: update bag lines/totals only — never wipe contact fields mid-typing.
      renderCheckoutBody(overlay, cart, i18n, { preserveForm: true });
    }
  });

  return {
    open: () => openCheckout(overlay, cart, i18n),
    close: () => closeCheckout(overlay),
    refresh: () => refreshLabels(overlay, i18n),
  };
}

async function loadDeliveryRates() {
  if (cachedDeliveryRates) return cachedDeliveryRates;
  if (!isSupabaseConfigured()) {
    cachedDeliveryRates = [];
    return cachedDeliveryRates;
  }
  try {
    cachedDeliveryRates = await getDeliveryRates({ activeOnly: true });
  } catch (err) {
    console.warn('[checkout] delivery rates unavailable:', err?.message || err);
    cachedDeliveryRates = [];
  }
  return cachedDeliveryRates;
}

function buildShell() {
  return `
    <div class="checkout-overlay__backdrop" data-checkout-close></div>
    <aside class="checkout-drawer" role="dialog" aria-modal="true" aria-labelledby="checkout-title" data-checkout-drawer>
      <header class="checkout-drawer__header">
        <h2 class="checkout-drawer__title" id="checkout-title" data-checkout-title>Checkout</h2>
        <button type="button" class="checkout-drawer__close" data-checkout-close aria-label="Close">✕</button>
      </header>
      <div class="checkout-drawer__body" data-checkout-body></div>
      <footer class="checkout-drawer__footer" data-checkout-footer hidden></footer>
    </aside>
  `;
}

async function openCheckout(overlay, cart, i18n) {
  overlay.classList.add('is-open');
  document.body.style.overflow = 'hidden';
  refreshLabels(overlay, i18n);
  // Render bag immediately so a slow/failed rates fetch never leaves a blank drawer.
  renderCheckoutBody(overlay, cart, i18n, { preserveForm: false });
  overlay.querySelector('[data-checkout-drawer]')?.focus();

  cachedDeliveryRates = null;
  await loadDeliveryRates();
  if (overlay.classList.contains('is-open')) {
    renderCheckoutBody(overlay, cart, i18n, { preserveForm: true });
  }
}

function closeCheckout(overlay) {
  overlay.classList.remove('is-open');
  document.body.style.overflow = '';
}

function refreshLabels(overlay, i18n) {
  const t = i18n.t.bind(i18n);
  overlay.querySelector('[data-checkout-title]').textContent = t('checkout.title');
  overlay.querySelector('.checkout-drawer__close')?.setAttribute('aria-label', t('checkout.close'));
  overlay.setAttribute('dir', i18n.getDir());
}

/**
 * Read current contact + payment fields so a cart refresh can restore them.
 * @param {HTMLElement} overlay
 */
function readCheckoutFormState(overlay) {
  const form = overlay.querySelector('[data-checkout-form]');
  if (!(form instanceof HTMLFormElement)) return null;
  const payment = form.querySelector('input[name="paymentMethod"]:checked');
  return {
    fullName: String(form.fullName?.value || ''),
    phone: String(form.phone?.value || ''),
    email: String(form.email?.value || ''),
    address: String(form.address?.value || ''),
    city: String(form.city?.value || ''),
    deliveryRateId: String(form.deliveryRateId?.value || form.querySelector('[name="deliveryRateId"]')?.value || ''),
    paymentMethod: payment instanceof HTMLInputElement ? payment.value : 'cad',
    activeName: document.activeElement instanceof HTMLElement
      && form.contains(document.activeElement)
      ? document.activeElement.getAttribute('name')
      : null,
    selectionStart: document.activeElement instanceof HTMLInputElement
      || document.activeElement instanceof HTMLTextAreaElement
      ? document.activeElement.selectionStart
      : null,
    selectionEnd: document.activeElement instanceof HTMLInputElement
      || document.activeElement instanceof HTMLTextAreaElement
      ? document.activeElement.selectionEnd
      : null,
  };
}

/**
 * @param {HTMLElement} overlay
 * @param {ReturnType<readCheckoutFormState>} state
 */
function restoreCheckoutFormState(overlay, state) {
  if (!state) return;
  const form = overlay.querySelector('[data-checkout-form]');
  if (!(form instanceof HTMLFormElement)) return;

  if (form.fullName) form.fullName.value = state.fullName;
  if (form.phone) form.phone.value = state.phone;
  if (form.email) form.email.value = state.email;
  if (form.address) form.address.value = state.address;
  if (form.city) form.city.value = state.city;
  if (form.deliveryRateId && state.deliveryRateId) {
    form.deliveryRateId.value = state.deliveryRateId;
  } else if (state.deliveryRateId) {
    const select = form.querySelector('[name="deliveryRateId"]');
    if (select) select.value = state.deliveryRateId;
  }

  const radio = form.querySelector(`input[name="paymentMethod"][value="${CSS.escape(state.paymentMethod || 'cad')}"]`);
  if (radio instanceof HTMLInputElement) radio.checked = true;

  if (state.activeName) {
    const field = form.elements.namedItem(state.activeName);
    if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
      field.focus({ preventScroll: true });
      if (typeof state.selectionStart === 'number' && typeof state.selectionEnd === 'number') {
        try {
          field.setSelectionRange(state.selectionStart, state.selectionEnd);
        } catch {
          /* ignore unsupported input types */
        }
      }
    }
  }
}

/**
 * @param {HTMLElement} overlay
 * @param {ReturnType<import('./cart.js').createCart>} cart
 * @param {ReturnType<import('./i18n.js').createI18n>} i18n
 * @param {{ preserveForm?: boolean }} [opts]
 */
function renderCheckoutBody(overlay, cart, i18n, opts = {}) {
  const t = i18n.t.bind(i18n);
  const body = overlay.querySelector('[data-checkout-body]');
  const footer = overlay.querySelector('[data-checkout-footer]');
  const { items, subtotal, shipping, total, count, deliveryCity } = cart.getSnapshot();
  const preserveForm = opts.preserveForm === true;
  const savedForm = preserveForm ? readCheckoutFormState(overlay) : null;
  const typingInForm = Boolean(
    document.activeElement
    && typeof document.activeElement.closest === 'function'
    && document.activeElement.closest('[data-checkout-form]'),
  );

  if (count === 0) {
    footer.hidden = true;
    body.innerHTML = `
      <div class="checkout-empty">
        <p>${t('checkout.empty')}</p>
        <p>${t('checkout.emptyHint')}</p>
        <button type="button" class="btn btn--ghost" style="margin-top:1.5rem" data-checkout-close>${t('checkout.continueShopping')}</button>
      </div>
    `;
    return;
  }

  footer.hidden = false;

  // While the customer is typing, only refresh line items + totals — keep the form DOM intact.
  const existingForm = overlay.querySelector('[data-checkout-form]');
  if (preserveForm && existingForm && typingInForm) {
    const linesHost = overlay.querySelector('[data-checkout-lines]');
    if (linesHost) {
      linesHost.innerHTML = items.map(({ product, qty }) => lineHtml(product, qty, i18n)).join('');
    }
    renderCheckoutFooter(footer, i18n, subtotal, shipping, total, deliveryCity);
    return;
  }

  body.innerHTML = `
    <div class="checkout-lines" data-checkout-lines>
      ${items.map(({ product, qty }) => lineHtml(product, qty, i18n)).join('')}
    </div>

    <section class="checkout-section">
      <h3 class="checkout-section__title">${t('checkout.contact')}</h3>
      <form id="checkout-form" data-checkout-form novalidate>
        <div class="checkout-field">
          <label for="co-name">${t('checkout.fullName')}</label>
          <input type="text" id="co-name" name="fullName" required autocomplete="name">
        </div>
        <div class="checkout-field--row">
          <div class="checkout-field">
            <label for="co-phone">${t('checkout.phone')}</label>
            <input type="tel" id="co-phone" name="phone" required autocomplete="tel">
          </div>
          <div class="checkout-field">
            <label for="co-email">${t('checkout.email')}</label>
            <input type="email" id="co-email" name="email" required autocomplete="email" inputmode="email">
          </div>
        </div>
        <div class="checkout-field">
          <label for="co-address">${t('checkout.address')}</label>
          <input type="text" id="co-address" name="address" required autocomplete="street-address">
        </div>
        <div class="checkout-field">
          <label for="co-city">${t('checkout.city')}</label>
          <select id="co-city" name="deliveryRateId" data-delivery-city required>
            ${deliveryCityOptionsHtml(cachedDeliveryRates || [], cart.getSnapshot().deliveryCity, i18n)}
          </select>
          <input type="hidden" name="city" value="${escapeAttr(cart.getSnapshot().deliveryCity?.city_ar || '')}">
          <p class="checkout-field__hint">${t('checkout.deliveryHint')}</p>
        </div>

        <section class="checkout-section">
          <h3 class="checkout-section__title">${t('checkout.payment')}</h3>
          <div class="checkout-payments">
            <label class="checkout-payment">
              <input type="radio" name="paymentMethod" value="cad" checked>
              <span class="checkout-payment__card">
                <span class="checkout-payment__icon">CAD</span>
                <span>
                  <p class="checkout-payment__name">${t('checkout.cad')}</p>
                  <p class="checkout-payment__desc">${t('checkout.cadDesc')}</p>
                </span>
              </span>
            </label>
            <div class="checkout-payment checkout-payment--coming-soon" aria-disabled="true">
              <span class="checkout-payment__card checkout-payment__card--credit">
                <span class="checkout-payment__icon checkout-payment__icon--credit">CR</span>
                <span class="checkout-payment__body">
                  <span class="checkout-payment__name-row">
                    <p class="checkout-payment__name">${t('checkout.upay')}</p>
                    <span class="checkout-payment__badge">${t('checkout.comingSoon')}</span>
                  </span>
                  <p class="checkout-payment__desc">${t('checkout.upayDesc')}</p>
                </span>
              </span>
            </div>
          </div>
        </section>
      </form>
    </section>
  `;

  renderCheckoutFooter(footer, i18n, subtotal, shipping, total, deliveryCity);
  bindFormEvents(overlay, cart, i18n);
  if (savedForm) restoreCheckoutFormState(overlay, savedForm);
}

/**
 * @param {HTMLElement} footer
 * @param {ReturnType<import('./i18n.js').createI18n>} i18n
 * @param {number} subtotal
 * @param {number} shipping
 * @param {number} total
 */
function renderCheckoutFooter(footer, i18n, subtotal, shipping, total, deliveryCity = null) {
  const t = i18n.t.bind(i18n);
  const shippingLabel = !deliveryCity
    ? t('checkout.shippingCalc')
    : (shipping === 0 ? t('checkout.shippingFree') : i18n.formatPrice(shipping));
  footer.innerHTML = `
    <div class="checkout-totals">
      <div class="checkout-totals__row">
        <span>${t('checkout.subtotal')}</span>
        <span>${i18n.formatPrice(subtotal)}</span>
      </div>
      <div class="checkout-totals__row">
        <span>${t('checkout.shipping')}</span>
        <span>${shippingLabel}</span>
      </div>
      <div class="checkout-totals__row checkout-totals__row--grand">
        <span>${t('checkout.total')}</span>
        <span>${i18n.formatPrice(total)}</span>
      </div>
    </div>
    <p class="checkout-error" data-checkout-error role="alert"></p>
    <button type="submit" form="checkout-form" class="btn btn--primary checkout-submit" data-checkout-submit>${t('checkout.placeOrder')}</button>
  `;
}

function lineHtml(product, qty, i18n) {
  const display = i18n.translateProduct(product);
  return `
    <div class="checkout-line" data-line-id="${product.id}">
      <p class="checkout-line__name">${escapeHtml(display.displayName)}</p>
      <p class="checkout-line__meta">${escapeHtml(display.displayCategory)}</p>
      <span class="checkout-line__price">${i18n.formatPrice(product.price * qty)}</span>
      <div class="checkout-line__controls">
        <div class="checkout-qty">
          <button type="button" class="checkout-qty__btn" data-qty-minus data-product-id="${product.id}" aria-label="-">−</button>
          <span class="checkout-qty__val">${qty}</span>
          <button type="button" class="checkout-qty__btn" data-qty-plus data-product-id="${product.id}" aria-label="+">+</button>
        </div>
        <button type="button" class="checkout-line__remove" data-remove-item data-product-id="${product.id}">${i18n.t('checkout.remove')}</button>
      </div>
    </div>
  `;
}

function bindOverlayEvents(overlay, cart, i18n) {
  overlay.addEventListener('click', (event) => {
    if (event.target.matches('[data-checkout-close], .checkout-overlay__backdrop')) {
      closeCheckout(overlay);
    }

    const minus = event.target.closest('[data-qty-minus]');
    if (minus) {
      const id = minus.dataset.productId;
      const line = cart.getSnapshot().items.find((i) => i.product.id === id);
      if (line) cart.updateQty(id, line.qty - 1);
      return;
    }

    const plus = event.target.closest('[data-qty-plus]');
    if (plus) {
      const id = plus.dataset.productId;
      const line = cart.getSnapshot().items.find((i) => i.product.id === id);
      if (!line) return;
      const stock = Number(line.product.stockQuantity ?? line.product.stock ?? Infinity);
      if (line.qty >= stock) return;
      cart.updateQty(id, line.qty + 1);
      return;
    }

    const remove = event.target.closest('[data-remove-item]');
    if (remove) {
      cart.remove(remove.dataset.productId);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && overlay.classList.contains('is-open')) {
      closeCheckout(overlay);
    }
  });
}

function bindFormEvents(overlay, cart, i18n) {
  const form = overlay.querySelector('[data-checkout-form]');
  if (!form || form.dataset.bound === '1') return;
  form.dataset.bound = '1';

  form.addEventListener('change', (event) => {
    const select = event.target.closest('[data-delivery-city]');
    if (!(select instanceof HTMLSelectElement)) return;
    applyDeliveryCityFromSelect(cart, form, select);
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    await submitOrder(overlay, cart, i18n, form);
  });
}

/**
 * @param {ReturnType<import('./cart.js').createCart>} cart
 * @param {HTMLFormElement} form
 * @param {HTMLSelectElement} select
 */
function applyDeliveryCityFromSelect(cart, form, select) {
  const id = String(select.value || '').trim();
  const rate = (cachedDeliveryRates || []).find((r) => String(r.id) === id);
  if (!rate) {
    cart.setDeliveryCity(null);
    if (form.city) form.city.value = '';
    return;
  }
  cart.setDeliveryCity(rate);
  if (form.city) form.city.value = String(rate.city_ar || rate.city_en || '');
}

/**
 * @param {object[]} rates
 * @param {object | null} selected
 * @param {ReturnType<import('./i18n.js').createI18n>} i18n
 */
function deliveryCityOptionsHtml(rates, selected, i18n) {
  const t = i18n.t.bind(i18n);
  const selectedId = selected?.id ? String(selected.id) : '';
  if (!rates.length) {
    return `<option value="">${escapeHtml(t('checkout.deliveryUnavailable'))}</option>`;
  }

  const inside = rates.filter((r) => r.zone === 'inside_benghazi');
  const outside = rates.filter((r) => r.zone === 'outside_benghazi');
  const other = rates.filter((r) => r.zone !== 'inside_benghazi' && r.zone !== 'outside_benghazi');

  const option = (r) => {
    const labelAr = String(r.city_ar || '').trim();
    const labelEn = String(r.city_en || '').trim();
    const price = Number(r.price_lyd) || 0;
    const label = labelEn
      ? `${labelAr} / ${labelEn} — ${i18n.formatPrice(price)}`
      : `${labelAr} — ${i18n.formatPrice(price)}`;
    const sel = String(r.id) === selectedId ? ' selected' : '';
    return `<option value="${escapeAttr(r.id)}"${sel}>${escapeHtml(label)}</option>`;
  };

  return [
    `<option value="">${escapeHtml(t('checkout.chooseCity'))}</option>`,
    inside.length ? `<optgroup label="${escapeAttr(t('checkout.zoneInside'))}">${inside.map(option).join('')}</optgroup>` : '',
    outside.length ? `<optgroup label="${escapeAttr(t('checkout.zoneOutside'))}">${outside.map(option).join('')}</optgroup>` : '',
    other.length ? `<optgroup label="${escapeAttr(t('checkout.city'))}">${other.map(option).join('')}</optgroup>` : '',
  ].join('');
}

async function submitOrder(overlay, cart, i18n, form) {
  const t = i18n.t.bind(i18n);
  const errorEl = overlay.querySelector('[data-checkout-error]');
  const submitBtn = overlay.querySelector('[data-checkout-submit]');
  const snapshot = cart.getSnapshot();

  if (!validateContact(form, errorEl, t)) return;

  // Credit card is Coming Soon — only CAD is available.
  const paymentMethod = 'cad';

  const payload = {
    paymentMethod,
    customer: {
      fullName: form.fullName.value.trim(),
      phone: form.phone.value.trim(),
      email: form.email.value.trim(),
      address: form.address.value.trim(),
      city: form.city.value.trim(),
    },
    items: snapshot.items.map(({ product, qty }) => ({
      productId: product.id,
      name: product.name,
      price: product.price,
      qty,
    })),
    subtotal: snapshot.subtotal,
    shipping: snapshot.shipping,
    total: snapshot.total,
    locale: i18n.getLocale(),
  };

  submitBtn.disabled = true;
  submitBtn.textContent = t('checkout.processing');
  if (errorEl) errorEl.textContent = '';

  try {
    let invoiceNumber = '';

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      let data;
      try {
        data = await res.json();
      } catch {
        throw new Error('network');
      }

      if (res.ok && data.ok) {
        invoiceNumber = data.invoiceNumber || data.orderRef || '';
      } else if (data?.code === 'not_configured' || /not configured/i.test(data?.error || '')) {
        // API missing server env — place the order from the browser with the same keys as the catalog.
        invoiceNumber = await placeOrderClientSide(payload);
      } else {
        throw new Error(data?.error || t('checkout.errorGeneric'));
      }
    } catch (apiErr) {
      if (apiErr.message === 'network' || apiErr.message === 'Failed to fetch') {
        if (isSupabaseConfigured()) {
          invoiceNumber = await placeOrderClientSide(payload);
        } else {
          throw apiErr;
        }
      } else {
        throw apiErr;
      }
    }

    cart.clear();
    showSuccess(overlay, i18n, invoiceNumber || '—', paymentMethod);
  } catch (err) {
    if (errorEl) errorEl.textContent = err.message || t('checkout.errorGeneric');
    submitBtn.disabled = false;
    submitBtn.textContent = t('checkout.placeOrder');
  }
}

/**
 * Browser-side fallback using the storefront Supabase anon client.
 * @param {object} payload
 * @returns {Promise<string>} invoice number
 */
async function placeOrderClientSide(payload) {
  if (!isSupabaseConfigured()) {
    throw new Error('Order storage is not configured. Set Supabase keys and redeploy.');
  }

  const lineItems = (payload.items || []).map((line) => ({
    product_id: String(line.productId),
    quantity: Math.trunc(Number(line.qty) || 0),
    unit_price: Number(line.price) || 0,
    wholesale_cost: Number(line.cost || line.wholesale_cost || 0),
    product_name: String(line.name || 'Item'),
  })).filter((line) => line.product_id && line.quantity > 0);

  if (!lineItems.length) throw new Error('Your bag is empty.');

  const status = payload.paymentMethod === 'upay' ? 'paid' : 'pending';
  const customer = payload.customer || {};

  const result = await createOrder({
    source: 'online',
    status,
    total_amount: Number(payload.total) || 0,
    subtotal_amount: Number(payload.subtotal) || 0,
    shipping_amount: Number(payload.shipping) || 0,
    customer_name: String(customer.fullName || '').trim(),
    customer_phone: String(customer.phone || '').trim(),
    customer_email: String(customer.email || '').trim(),
    customer_address: String(customer.address || '').trim(),
    customer_city: String(customer.city || '').trim(),
    customer_location: [customer.address, customer.city].filter(Boolean).join(', '),
    payment_method: payload.paymentMethod,
    payment_status: payload.paymentMethod === 'upay' ? 'paid' : 'cod_pending',
    notes: payload.locale ? `Locale: ${payload.locale}` : null,
  }, lineItems);

  const orderId = result?.order?.id;
  const invoiceNumber = result?.order?.invoice_number || result?.order?.id || '';

  if (orderId) {
    fetch('/api/push?action=notify-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId }),
    }).catch(() => {});
  }

  // Same confirmation email path used when /api/orders is unavailable.
  if (invoiceNumber && customer.email) {
    fetch('/api/order-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        invoiceNumber,
        paymentMethod: payload.paymentMethod,
        customer,
        items: payload.items,
        subtotal: payload.subtotal,
        shipping: payload.shipping,
        total: payload.total,
      }),
    }).catch(() => {});
  }

  return invoiceNumber;
}

function validateContact(form, errorEl, t) {
  const required = ['fullName', 'phone', 'email', 'address'];
  for (const name of required) {
    if (!form[name]?.value.trim()) {
      if (errorEl) errorEl.textContent = t('checkout.errorRequired');
      form[name]?.focus();
      return false;
    }
  }
  const citySelect = form.querySelector('[data-delivery-city]');
  if (citySelect instanceof HTMLSelectElement) {
    if (!citySelect.value) {
      if (errorEl) errorEl.textContent = t('checkout.errorCity');
      citySelect.focus();
      return false;
    }
  } else if (!form.city?.value.trim()) {
    if (errorEl) errorEl.textContent = t('checkout.errorRequired');
    form.city?.focus();
    return false;
  }
  return true;
}

function validateCard(form, errorEl, t) {
  const number = form.cardNumber.value.replace(/\s/g, '');
  const expiry = form.cardExpiry.value.trim();
  const cvc = form.cardCvc.value.trim();
  const name = form.cardName.value.trim();

  if (!name || number.length < 15 || expiry.length < 4 || cvc.length < 3) {
    if (errorEl) errorEl.textContent = t('checkout.errorCard');
    return false;
  }
  return true;
}

function showSuccess(overlay, i18n, orderRef, paymentMethod) {
  const t = i18n.t.bind(i18n);
  const body = overlay.querySelector('[data-checkout-body]');
  const footer = overlay.querySelector('[data-checkout-footer]');
  footer.hidden = true;

  const msg = paymentMethod === 'upay' ? t('checkout.successUpay') : t('checkout.successCad');

  body.innerHTML = `
    <div class="checkout-success">
      <div class="checkout-success__icon" aria-hidden="true">✦</div>
      <h3>${t('checkout.successTitle')}</h3>
      <p>${msg}</p>
      <p class="checkout-success__ref">${t('checkout.orderRef')}: ${escapeHtml(orderRef)}</p>
      <button type="button" class="btn btn--primary" data-checkout-close>${t('checkout.close')}</button>
    </div>
  `;
}

function formatCardNumber(value) {
  const digits = value.replace(/\D/g, '').slice(0, 16);
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
}

function formatExpiry(value) {
  const digits = value.replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)} / ${digits.slice(2)}`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
