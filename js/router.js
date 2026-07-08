/**
 * Unified domain router — entry point that isolates Storefront from POS execution.
 */
import { resolveAppLayer, getLayerConfig } from './config/domains.js';

const ROOT_ID = 'app-root';

/**
 * Inject a stylesheet once.
 * @param {string} href
 */
function loadStylesheet(href) {
  if (document.querySelector(`link[data-app-css="${href}"]`)) return;

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.dataset.appCss = href;
  document.head.appendChild(link);
}

/**
 * Show a minimal boot screen while the app module loads.
 * @param {string} label
 */
function renderBootScreen(label) {
  const root = document.getElementById(ROOT_ID);
  if (!root) return;

  root.innerHTML = `
    <div class="boot-screen" role="status" aria-live="polite">
      <div class="boot-screen__spinner" aria-hidden="true"></div>
      <p class="boot-screen__label">Loading ${label}…</p>
    </div>
  `;
}

/**
 * Render a fatal routing error.
 * @param {Error} error
 */
function renderBootError(error) {
  const root = document.getElementById(ROOT_ID);
  if (!root) return;

  root.innerHTML = `
    <div class="boot-error" role="alert">
      <h1>Unable to start application</h1>
      <p>${error.message}</p>
      <button type="button" onclick="location.reload()">Retry</button>
    </div>
  `;
}

/**
 * Boot the correct application layer based on hostname.
 * @param {object} [options]
 * @param {string} [options.hostname]
 * @param {URLSearchParams} [options.searchParams]
 */
export async function bootRouter(options = {}) {
  const hostname = options.hostname ?? window.location.hostname;
  const searchParams = options.searchParams ?? new URLSearchParams(window.location.search);

  const layer = resolveAppLayer(hostname, searchParams);
  const config = getLayerConfig(layer);

  document.documentElement.dataset.app = layer;
  document.title = config.title;

  loadStylesheet(config.css);
  renderBootScreen(config.label);

  try {
    const module = await import(config.module);
    const root = document.getElementById(ROOT_ID);

    if (!root) {
      throw new Error(`Mount point #${ROOT_ID} not found.`);
    }

    if (typeof module.mount !== 'function') {
      throw new Error(`App module ${config.module} must export a mount() function.`);
    }

    root.replaceChildren();
    await module.mount(root, { layer, hostname, supabase: null });
  } catch (error) {
    console.error('[router] Boot failed:', error);
    renderBootError(error instanceof Error ? error : new Error(String(error)));
  }
}

// Auto-boot when loaded as entry script
bootRouter();
