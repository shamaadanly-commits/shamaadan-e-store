/**
 * Lightweight shopping bag state for the storefront.
 */

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
    const total = list.reduce((sum, { product, qty }) => sum + product.price * qty, 0);
    return { items: list, count, total };
  }

  /**
   * @param {object} product
   * @returns {{ added: boolean, snapshot: ReturnType<typeof getSnapshot> }}
   */
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

  function clear() {
    items.clear();
    notify();
  }

  function subscribe(fn) {
    listeners.add(fn);
    fn(getSnapshot());
    return () => listeners.delete(fn);
  }

  return { add, clear, subscribe, getSnapshot };
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
