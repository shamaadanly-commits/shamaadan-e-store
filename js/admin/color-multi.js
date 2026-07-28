/**
 * Multi-color variant editor for the admin catalog form.
 * Each color can have its own price and description.
 * Stored in hidden `colorsList` as JSON.
 */

/**
 * @typedef {{ color: string, retailPrice: number | '', description: string }} ColorVariant
 */

/**
 * @param {HTMLFormElement} form
 * @param {{
 *   initialColor?: string,
 *   initialPrice?: number | string,
 *   initialDescription?: string,
 * }} [seed]
 */
export function bindColorMultiInput(form, seed = {}) {
  const root = form.querySelector('[data-color-multi]');
  if (!root) return;

  const hidden = root.querySelector('[data-colors-value]');
  const listHost = root.querySelector('[data-color-chips]');
  const input = root.querySelector('[data-color-input]');
  const addBtn = root.querySelector('[data-color-add]');
  if (!hidden || !listHost || !input) return;

  const defaultPrice = () => {
    const retail = form.querySelector('[name="retailPrice"]');
    const n = Number(retail instanceof HTMLInputElement ? retail.value : seed.initialPrice);
    return Number.isFinite(n) ? n : '';
  };

  const defaultDescription = () => {
    const desc = form.querySelector('[name="description"]');
    if (desc instanceof HTMLTextAreaElement || desc instanceof HTMLInputElement) {
      return String(desc.value || '').trim();
    }
    return String(seed.initialDescription || '').trim();
  };

  /** @type {ColorVariant[]} */
  let variants = parseVariants(hidden.value, {
    color: seed.initialColor || '',
    retailPrice: seed.initialPrice ?? '',
    description: seed.initialDescription || '',
  });

  function writeHidden() {
    hidden.value = JSON.stringify(variants.map((v) => ({
      color: String(v.color || '').trim(),
      retailPrice: v.retailPrice === '' ? '' : Number(v.retailPrice),
      description: String(v.description || '').trim(),
    })).filter((v) => v.color));
  }

  function sync() {
    writeHidden();
    if (!variants.length) {
      listHost.innerHTML = '<p class="dash-color-chips__empty">No colors yet — add each color with its own price and description.</p>';
      return;
    }

    listHost.innerHTML = variants.map((variant, index) => `
      <div class="dash-color-variant" data-color-index="${index}">
        <div class="dash-color-variant__top">
          <strong class="dash-color-variant__name">${escapeHtml(variant.color)}</strong>
          <button type="button" class="dash-color-chip__remove" data-color-remove="${index}" aria-label="Remove ${escapeAttr(variant.color)}">×</button>
        </div>
        <div class="dash-color-variant__grid">
          <div class="dash-field">
            <label>Price / السعر</label>
            <input
              type="number"
              min="0"
              step="0.01"
              inputmode="decimal"
              data-color-price="${index}"
              value="${escapeAttr(variant.retailPrice === '' || variant.retailPrice == null ? '' : String(variant.retailPrice))}"
              placeholder="48.00"
            >
          </div>
          <div class="dash-field dash-field--full">
            <label>Description / الوصف</label>
            <textarea
              rows="3"
              class="dash-input--bidi"
              data-color-desc="${index}"
              placeholder="Optional details for this color"
            >${escapeHtml(variant.description || '')}</textarea>
          </div>
        </div>
      </div>
    `).join('');
  }

  function addColor() {
    const value = String(input.value || '').trim();
    if (!value) return;
    const exists = variants.some((v) => v.color.toLowerCase() === value.toLowerCase());
    if (!exists) {
      variants.push({
        color: value,
        retailPrice: defaultPrice(),
        description: defaultDescription(),
      });
    }
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

  listHost.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-color-remove]');
    if (!btn) return;
    const index = Number(btn.getAttribute('data-color-remove'));
    if (!Number.isFinite(index)) return;
    variants = variants.filter((_, i) => i !== index);
    sync();
  });

  listHost.addEventListener('input', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return;

    const priceIndex = target.getAttribute('data-color-price');
    if (priceIndex != null) {
      const i = Number(priceIndex);
      if (!variants[i]) return;
      variants[i].retailPrice = target.value === '' ? '' : Number(target.value);
      writeHidden();
      return;
    }

    const descIndex = target.getAttribute('data-color-desc');
    if (descIndex != null) {
      const i = Number(descIndex);
      if (!variants[i]) return;
      variants[i].description = target.value;
      writeHidden();
    }
  });

  sync();
}

/**
 * @param {string} raw
 * @param {{ color?: string, retailPrice?: number | string, description?: string }} [fallback]
 * @returns {ColorVariant[]}
 */
function parseVariants(raw, fallback = {}) {
  const text = String(raw || '').trim();
  if (!text) {
    const color = String(fallback.color || '').trim();
    if (!color) return [];
    const price = fallback.retailPrice === '' || fallback.retailPrice == null
      ? ''
      : Number(fallback.retailPrice);
    return [{
      color,
      retailPrice: Number.isFinite(price) ? price : '',
      description: String(fallback.description || '').trim(),
    }];
  }

  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return parsed
        .map((row) => {
          if (typeof row === 'string') {
            return {
              color: row.trim(),
              retailPrice: fallback.retailPrice === '' || fallback.retailPrice == null
                ? ''
                : Number(fallback.retailPrice),
              description: String(fallback.description || '').trim(),
            };
          }
          const color = String(row?.color || '').trim();
          if (!color) return null;
          const priceRaw = row?.retailPrice ?? row?.price;
          const price = priceRaw === '' || priceRaw == null ? '' : Number(priceRaw);
          return {
            color,
            retailPrice: price === '' || Number.isFinite(price) ? price : '',
            description: String(row?.description || '').trim(),
          };
        })
        .filter(Boolean);
    }
  } catch {
    // Legacy newline / comma list
  }

  return text
    .split(/\n|,/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((color) => ({
      color,
      retailPrice: fallback.retailPrice === '' || fallback.retailPrice == null
        ? ''
        : Number(fallback.retailPrice),
      description: String(fallback.description || '').trim(),
    }));
}

/**
 * Read color variants from a submitted form.
 * @param {FormData} data
 * @param {{ fallbackPrice?: number, fallbackDescription?: string }} [opts]
 * @returns {ColorVariant[]}
 */
export function readColorVariantsFromForm(data, opts = {}) {
  const fallbackPrice = opts.fallbackPrice;
  const fallbackDescription = String(opts.fallbackDescription || '').trim();
  const variants = parseVariants(String(data.get('colorsList') || data.get('color') || ''), {
    retailPrice: fallbackPrice,
    description: fallbackDescription,
  });

  return variants.map((v) => ({
    color: v.color,
    retailPrice: v.retailPrice === '' || v.retailPrice == null
      ? (Number.isFinite(fallbackPrice) ? fallbackPrice : 0)
      : Number(v.retailPrice),
    description: String(v.description || '').trim() || fallbackDescription,
  }));
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
