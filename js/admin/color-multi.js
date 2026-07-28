/**
 * Multi-color chip input for the admin catalog form.
 * Stores colors in a hidden `colorsList` field (newline-separated).
 */

/**
 * @param {HTMLFormElement} form
 */
export function bindColorMultiInput(form) {
  const root = form.querySelector('[data-color-multi]');
  if (!root) return;

  const hidden = root.querySelector('[data-colors-value]');
  const chipsHost = root.querySelector('[data-color-chips]');
  const input = root.querySelector('[data-color-input]');
  const addBtn = root.querySelector('[data-color-add]');
  if (!hidden || !chipsHost || !input) return;

  /** @type {string[]} */
  let colors = String(hidden.value || '')
    .split(/\n|,/)
    .map((s) => s.trim())
    .filter(Boolean);

  function sync() {
    hidden.value = colors.join('\n');
    chipsHost.innerHTML = colors.length
      ? colors.map((color, index) => `
          <span class="dash-color-chip">
            <span class="dash-color-chip__label">${escapeHtml(color)}</span>
            <button type="button" class="dash-color-chip__remove" data-color-remove="${index}" aria-label="Remove ${escapeAttr(color)}">×</button>
          </span>
        `).join('')
      : '<span class="dash-color-chips__empty">No colors yet</span>';
  }

  function addColor() {
    const value = String(input.value || '').trim();
    if (!value) return;
    const exists = colors.some((c) => c.toLowerCase() === value.toLowerCase());
    if (!exists) colors.push(value);
    input.value = '';
    sync();
    input.focus();
  }

  addBtn?.addEventListener('click', (event) => {
    event.preventDefault();
    addColor();
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      addColor();
    }
  });

  chipsHost.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-color-remove]');
    if (!btn) return;
    const index = Number(btn.getAttribute('data-color-remove'));
    if (!Number.isFinite(index)) return;
    colors = colors.filter((_, i) => i !== index);
    sync();
  });

  sync();
}

/**
 * @param {string} str
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * @param {string} str
 */
function escapeAttr(str) {
  return escapeHtml(str).replace(/"/g, '&quot;');
}
