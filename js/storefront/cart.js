/**
 * Shopping bag state with quantity controls.
 */

const FREE_SHIPPING_THRESHOLD = 75;
const SHIPPING_FLAT = 12;

export function createCart() {
  /** @type {Map<string, { product: object, qty: number }>} */
  const items = new Map();
  const listeners = new Set();

  function notify() {
    const snapshot = getSnapshot();
    listeners.forEach((fn) => fn(snapshot));
  }

  function getSnapshot() {
    const list = Array.from(items.values());
    const count = list.reduce((sum, { qty }) => sum + qty, 0);
    const subtotal = list.reduce((sum, { product, qty }) => sum + product.price * qty, 0);
    const shipping = subtotal >= FREE_SHIPPING_THRESHOLD || subtotal === 0 ? 0 : SHIPPING_FLAT;
    const total = subtotal + shipping;

    return { items: list, count, subtotal, shipping, total };
  }

  function add(product) {
    const existing = items.get(product.id);
    if (existing) {
      existing.qty += 1;
    } else {
      items.set(product.id, { product, qty: 1 });
    }
    notify();
    return { added: true, snapshot: getSnapshot() };
  }

  function updateQty(productId, qty) {
    const line = items.get(productId);
    if (!line) return;
    if (qty <= 0) {
      items.delete(productId);
    } else {
      line.qty = qty;
    }
    notify();
  }

  function remove(productId) {
    items.delete(productId);
    notify();
  }

  function clear() {
    items.clear();
    notify();
  }

  function subscribe(fn) {
    listeners.add(fn);
    fn(getSnapshot());
    return () => listeners.delete(fn);
  }

  return { add, updateQty, remove, clear, subscribe, getSnapshot };
}

/**
 * @param {HTMLElement} root
 * @param {ReturnType<typeof createCart>} cart
 */
export function bindCartUI(root, cart) {
  const countEl = root.querySelector('[data-cart-count]');

  cart.subscribe(({ count }) => {
    if (!countEl) return;
    countEl.textContent = String(count);
    countEl.classList.toggle('is-visible', count > 0);
  });
}

/**
 * @param {HTMLElement} root
 * @param {string} message
 */
export function showToast(root, message) {
  const toast = root.querySelector('[data-toast]');
  const msgEl = root.querySelector('[data-toast-message]');
  if (!toast || !msgEl) return;

  msgEl.textContent = message;
  toast.classList.add('is-visible');

  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    toast.classList.remove('is-visible');
  }, 2800);
}
