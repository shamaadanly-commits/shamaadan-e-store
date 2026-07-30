/**
 * Manual page zoom for the admin dashboard (CSS transform scale).
 * Native pinch / auto-zoom should stay disabled via viewport + form font-size.
 */

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2;
const STEP = 0.1;
const STORAGE_KEY = 'shamaadan-admin-page-zoom';

/**
 * Lock the document viewport so iOS Safari cannot auto-zoom or pinch-zoom.
 */
export function lockViewportZoom() {
  let meta = document.querySelector('meta[name="viewport"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'viewport';
    document.head.appendChild(meta);
  }
  meta.setAttribute(
    'content',
    'width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no, viewport-fit=cover',
  );

  const blockGesture = (event) => {
    event.preventDefault();
  };

  // iOS Safari legacy gesture events
  document.addEventListener('gesturestart', blockGesture, { passive: false });
  document.addEventListener('gesturechange', blockGesture, { passive: false });
  document.addEventListener('gestureend', blockGesture, { passive: false });

  // Block multi-touch pinch
  document.addEventListener(
    'touchmove',
    (event) => {
      if (event.touches && event.touches.length > 1) {
        event.preventDefault();
      }
    },
    { passive: false },
  );
}

/**
 * Wire +/- / reset controls to scale a zoom root with CSS transform.
 * @param {ParentNode} root
 */
export function bindPageZoom(root) {
  const controls = root.querySelector('[data-page-zoom-controls]');
  const stage = root.querySelector('[data-zoom-stage]');
  const label = root.querySelector('[data-zoom-label]');
  if (!controls || !stage) return;

  let zoom = readStoredZoom();

  function apply() {
    const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(zoom * 100) / 100));
    zoom = clamped;
    stage.style.setProperty('--page-zoom', String(clamped));
    stage.dataset.zoom = String(clamped);
    // Avoid transform: scale(1) — it still creates a containing block and can flicker iPad keyboards.
    if (Math.abs(clamped - 1) < 0.001) {
      delete stage.dataset.zoomed;
      stage.style.removeProperty('transform');
      stage.style.removeProperty('width');
    } else {
      stage.dataset.zoomed = '1';
    }
    if (label) label.textContent = `${Math.round(clamped * 100)}%`;
    try {
      sessionStorage.setItem(STORAGE_KEY, String(clamped));
    } catch {
      /* ignore */
    }
    const outBtn = controls.querySelector('[data-zoom-out]');
    const inBtn = controls.querySelector('[data-zoom-in]');
    if (outBtn instanceof HTMLButtonElement) outBtn.disabled = clamped <= MIN_ZOOM + 0.001;
    if (inBtn instanceof HTMLButtonElement) inBtn.disabled = clamped >= MAX_ZOOM - 0.001;
  }

  controls.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-zoom-in], [data-zoom-out], [data-zoom-reset]');
    if (!btn) return;
    if (btn.hasAttribute('data-zoom-in')) zoom = Math.min(MAX_ZOOM, zoom + STEP);
    else if (btn.hasAttribute('data-zoom-out')) zoom = Math.max(MIN_ZOOM, zoom - STEP);
    else zoom = 1;
    apply();
  });

  apply();
}

function readStoredZoom() {
  try {
    const raw = Number(sessionStorage.getItem(STORAGE_KEY));
    if (Number.isFinite(raw) && raw >= MIN_ZOOM && raw <= MAX_ZOOM) return raw;
  } catch {
    /* ignore */
  }
  return 1;
}
