/**
 * Product image uploader — PC file picker + mobile camera/gallery.
 * Prefers /api/upload (Cloudflare R2). Falls back to Supabase Storage.
 */

import { isSupabaseConfigured, uploadProductImage } from '../../shared/supabase.js';

const MAX_FILES = 6;
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.82;

/**
 * Bind upload UI inside a product form.
 * @param {HTMLElement} form
 */
export function bindImageUploader(form) {
  const root = form.querySelector('[data-image-uploader]');
  if (!root || root.dataset.bound === '1') return;
  root.dataset.bound = '1';

  const fileInput = root.querySelector('[data-image-file]');
  const urlsField = root.querySelector('[data-image-urls]');
  const preview = root.querySelector('[data-image-preview]');
  const status = root.querySelector('[data-image-status]');
  const uploadBtn = root.querySelector('[data-image-pick]');

  if (!fileInput || !urlsField || !preview) return;

  function getUrls() {
    return String(urlsField.value || '')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function setUrls(urls) {
    urlsField.value = urls.join('\n');
    // Keep a stable copy so a form re-render can be detected as dirty editing.
    urlsField.dataset.hasImages = urls.length ? '1' : '';
    renderPreview();
  }

  function setStatus(message, tone = '') {
    if (!status) return;
    status.textContent = message || '';
    status.dataset.tone = tone;
    status.hidden = !message;
  }

  function renderPreview() {
    const urls = getUrls();
    if (!urls.length) {
      preview.innerHTML = '<p class="dash-upload__empty">No images yet — upload from this device</p>';
      return;
    }

    preview.innerHTML = urls.map((url, index) => `
      <div class="dash-upload__item" data-image-index="${index}">
        <img src="${escapeAttr(url)}" alt="Product image ${index + 1}" loading="lazy">
        <button type="button" class="dash-upload__remove" data-remove-image="${index}" aria-label="Remove image">×</button>
      </div>
    `).join('');
  }

  uploadBtn?.addEventListener('click', () => fileInput.click());

  preview.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-remove-image]');
    if (!btn) return;
    const index = Number(btn.dataset.removeImage);
    const next = getUrls().filter((_, i) => i !== index);
    setUrls(next);
    setStatus(next.length ? `${next.length} image(s)` : '');
  });

  fileInput.addEventListener('change', async () => {
    const files = [...(fileInput.files || [])];
    fileInput.value = '';
    if (!files.length) return;

    const existing = getUrls();
    const room = Math.max(0, MAX_FILES - existing.length);
    if (!room) {
      setStatus(`Maximum ${MAX_FILES} images`, 'error');
      return;
    }

    const batch = files.slice(0, room);
    setStatus(`Uploading ${batch.length} image(s)…`);

    const uploaded = [];
    for (const file of batch) {
      if (!file.type.startsWith('image/')) {
        setStatus('Only image files are allowed', 'error');
        continue;
      }

      try {
        const dataUrl = await readAndCompress(file);
        const result = await uploadImage({
          filename: file.name,
          contentType: file.type || 'image/jpeg',
          data: dataUrl,
        });
        uploaded.push(result.url);
      } catch (error) {
        console.error('[image-upload]', error);
        setStatus(error.message || 'Upload failed', 'error');
      }
    }

    if (uploaded.length) {
      setUrls([...existing, ...uploaded]);
      setStatus(`${uploaded.length} image(s) uploaded`, 'ok');
    }
  });

  renderPreview();
}

/**
 * @param {{ filename: string, contentType: string, data: string }} payload
 * @returns {Promise<{ ok: boolean, url: string, configured?: boolean }>}
 */
async function uploadImage(payload) {
  // 1) Prefer Cloudflare R2 via serverless API when configured.
  try {
    const res = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const json = await res.json();
        if (json.ok && json.url && !String(json.url).startsWith('data:')) {
          return json;
        }
        // R2 not configured or returned a temporary data URL — fall through.
      }
    } else if (res.status !== 404 && res.status < 500) {
      const text = await res.text();
      let message = 'Upload failed';
      try {
        message = JSON.parse(text).error || message;
      } catch {
        // keep default
      }
      throw new Error(message);
    }
  } catch (error) {
    if (error instanceof Error && /upload failed|too large|missing image|only image/i.test(error.message)) {
      throw error;
    }
    // Network / missing API — try Supabase Storage next.
  }

  // 2) Durable fallback: Supabase Storage (uses existing project keys).
  if (isSupabaseConfigured() && payload.data?.startsWith('data:')) {
    const url = await uploadProductImage({
      dataUrl: payload.data,
      filename: payload.filename,
      contentType: payload.contentType,
    });
    return { ok: true, configured: true, url };
  }

  throw new Error(
    'Could not store the image. Configure Cloudflare R2, or run sql/product_images_storage.sql in Supabase.',
  );
}

/**
 * Read file and optionally downscale for smaller payloads.
 * @param {File} file
 * @returns {Promise<string>} data URL
 */
function readAndCompress(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
        if (scale >= 1 && file.size < 900_000) {
          resolve(dataUrl);
          return;
        }

        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Shared markup for image upload field.
 * @param {string[]} imageUrls
 * @param {string} [fieldId]
 */
export function imageUploaderHtml(imageUrls = [], fieldId = 'product-images') {
  const urls = (imageUrls || []).filter(Boolean);

  return `
    <div class="dash-field dash-upload" data-image-uploader>
      <div class="dash-upload__header">
        <label for="${escapeAttr(fieldId)}">Product Images</label>
        <button type="button" class="dash-btn dash-btn--ghost dash-btn--sm" data-image-pick>
          🖼 Choose from gallery
        </button>
      </div>
      <p class="dash-field__hint">Pick from your phone gallery or take a new photo. Images are stored in the cloud so they stay after saving.</p>

      <input
        type="file"
        accept="image/*"
        multiple
        class="dash-upload__file"
        data-image-file
        aria-label="Choose product images from gallery or camera"
      >

      <div class="dash-upload__preview" data-image-preview></div>
      <p class="dash-upload__status" data-image-status></p>

      <label class="sr-only" for="${escapeAttr(fieldId)}">Image URLs</label>
      <textarea
        id="${escapeAttr(fieldId)}"
        name="imageUrls"
        rows="2"
        class="dash-upload__urls"
        data-image-urls
        placeholder="Uploaded image URLs appear here"
      >${escapeHtml(urls.join('\n'))}</textarea>
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
