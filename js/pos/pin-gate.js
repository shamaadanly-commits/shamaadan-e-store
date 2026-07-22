/**
 * POS PIN gate — on-screen numeric keypad for staff login.
 */
import { BRAND, logoImg } from '../shared/brand.js';

/**
 * @param {{ error?: string, busy?: boolean }} [opts]
 * @returns {string}
 */
export function pinGateHtml(opts = {}) {
  const error = opts.error ? `<p class="pos-pin__error" data-pin-error>${escapeHtml(opts.error)}</p>` : '<p class="pos-pin__error" data-pin-error hidden></p>';
  return `
    <div class="pos-pin" data-pos-pin-gate>
      <div class="pos-pin__card">
        <div class="pos-pin__brand">
          ${logoImg({ className: 'pos-pin__logo', size: 'ritual', alt: BRAND.name, loading: 'eager' })}
          <h1>${escapeHtml(BRAND.name)}</h1>
          <p>Enter your staff PIN to open the register</p>
        </div>

        <div class="pos-pin__dots" data-pin-dots aria-live="polite" aria-label="PIN progress">
          ${Array.from({ length: 6 }, (_, i) => `<span class="pos-pin__dot" data-pin-dot="${i}"></span>`).join('')}
        </div>

        ${error}

        <div class="pos-pin__keypad" data-pin-keypad role="group" aria-label="PIN keypad">
          ${[1, 2, 3, 4, 5, 6, 7, 8, 9, 'clear', 0, 'del'].map((key) => {
            if (key === 'clear') {
              return '<button type="button" class="pos-pin__key pos-pin__key--action" data-pin-key="clear">C</button>';
            }
            if (key === 'del') {
              return '<button type="button" class="pos-pin__key pos-pin__key--action" data-pin-key="del" aria-label="Delete">⌫</button>';
            }
            return `<button type="button" class="pos-pin__key" data-pin-key="${key}">${key}</button>`;
          }).join('')}
        </div>

        <button type="button" class="pos-pin__submit" data-pin-submit disabled>Unlock Register</button>
      </div>
    </div>
  `;
}

/**
 * Bind keypad interactions.
 * @param {HTMLElement} root
 * @param {{ onSubmit: (pin: string) => void | Promise<void>, minLength?: number, maxLength?: number }} options
 */
export function bindPinGate(root, options) {
  const minLength = options.minLength ?? 4;
  const maxLength = options.maxLength ?? 6;
  let pin = '';
  let busy = false;

  const dots = root.querySelectorAll('[data-pin-dot]');
  const errorEl = root.querySelector('[data-pin-error]');
  const submitBtn = root.querySelector('[data-pin-submit]');

  function render() {
    dots.forEach((dot, i) => {
      dot.classList.toggle('is-filled', i < pin.length);
    });
    if (submitBtn) submitBtn.disabled = busy || pin.length < minLength;
  }

  function setError(msg) {
    if (!errorEl) return;
    if (!msg) {
      errorEl.hidden = true;
      errorEl.textContent = '';
      return;
    }
    errorEl.hidden = false;
    errorEl.textContent = msg;
  }

  function setBusy(next) {
    busy = next;
    if (submitBtn) {
      submitBtn.textContent = busy ? 'Checking…' : 'Unlock Register';
    }
    root.querySelectorAll('[data-pin-key]').forEach((btn) => {
      btn.disabled = busy;
    });
    render();
  }

  async function trySubmit() {
    if (busy || pin.length < minLength) return;
    setBusy(true);
    setError('');
    try {
      await options.onSubmit(pin);
    } finally {
      setBusy(false);
    }
  }

  root.addEventListener('click', (event) => {
    const keyBtn = event.target.closest('[data-pin-key]');
    if (keyBtn) {
      const key = keyBtn.dataset.pinKey;
      if (key === 'clear') {
        pin = '';
        setError('');
        render();
        return;
      }
      if (key === 'del') {
        pin = pin.slice(0, -1);
        setError('');
        render();
        return;
      }
      if (/^\d$/.test(key) && pin.length < maxLength) {
        pin += key;
        setError('');
        render();
        if (pin.length === maxLength) {
          trySubmit();
        }
      }
      return;
    }

    if (event.target.closest('[data-pin-submit]')) {
      trySubmit();
    }
  });

  root.addEventListener('keydown', (event) => {
    if (busy) return;
    if (/^\d$/.test(event.key) && pin.length < maxLength) {
      pin += event.key;
      setError('');
      render();
      if (pin.length === maxLength) trySubmit();
      return;
    }
    if (event.key === 'Backspace') {
      pin = pin.slice(0, -1);
      setError('');
      render();
      return;
    }
    if (event.key === 'Enter') {
      trySubmit();
    }
  });

  render();

  return {
    setError,
    clear() {
      pin = '';
      setError('');
      render();
    },
    shake() {
      const card = root.querySelector('.pos-pin__card');
      card?.classList.remove('is-shake');
      // force reflow
      void card?.offsetWidth;
      card?.classList.add('is-shake');
    },
  };
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
