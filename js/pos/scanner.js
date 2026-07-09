/**
 * POS camera barcode scanner.
 * Uses native BarcodeDetector when available; falls back to html5-qrcode CDN.
 */

const SCAN_COOLDOWN_MS = 1600;

/**
 * @param {object} options
 * @param {HTMLElement} options.root - POS root (for overlay mount)
 * @param {(code: string) => void} options.onScan
 * @param {(message: string) => void} [options.onError]
 */
export function createBarcodeScanner({ root, onScan, onError }) {
  let overlay = null;
  let video = null;
  let stream = null;
  let rafId = 0;
  let detector = null;
  let html5Qr = null;
  let lastCode = '';
  let lastAt = 0;
  let active = false;

  function emit(code) {
    const normalized = String(code || '').trim();
    if (!normalized) return;

    const now = Date.now();
    if (normalized === lastCode && now - lastAt < SCAN_COOLDOWN_MS) return;

    lastCode = normalized;
    lastAt = now;
    onScan(normalized);
  }

  function ensureOverlay() {
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.className = 'pos-scanner';
    overlay.hidden = true;
    overlay.innerHTML = `
      <div class="pos-scanner__panel" role="dialog" aria-modal="true" aria-labelledby="pos-scanner-title">
        <header class="pos-scanner__header">
          <div>
            <h2 id="pos-scanner-title">Scan barcode</h2>
            <p class="pos-scanner__hint">Point the camera at the product barcode</p>
          </div>
          <button type="button" class="pos-scanner__close" data-scanner-close aria-label="Close scanner">✕</button>
        </header>
        <div class="pos-scanner__viewport">
          <video class="pos-scanner__video" playsinline muted autoplay data-scanner-video></video>
          <div class="pos-scanner__frame" aria-hidden="true"></div>
          <div id="pos-scanner-html5" class="pos-scanner__html5" hidden></div>
        </div>
        <p class="pos-scanner__status" data-scanner-status>Starting camera…</p>
        <div class="pos-scanner__manual">
          <input type="text" inputmode="numeric" autocomplete="off" placeholder="Or type / wedge-scan barcode" data-scanner-manual aria-label="Manual barcode entry">
          <button type="button" class="pos-scanner__add" data-scanner-manual-add>Add</button>
        </div>
      </div>
    `;
    root.appendChild(overlay);

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay || event.target.closest('[data-scanner-close]')) {
        stop();
      }
    });

    const manualInput = overlay.querySelector('[data-scanner-manual]');
    const manualAdd = overlay.querySelector('[data-scanner-manual-add]');

    manualAdd?.addEventListener('click', () => {
      const value = manualInput?.value?.trim();
      if (value) {
        emit(value);
        if (manualInput) manualInput.value = '';
      }
    });

    manualInput?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        const value = manualInput.value.trim();
        if (value) {
          emit(value);
          manualInput.value = '';
        }
      }
    });

    return overlay;
  }

  function setStatus(message) {
    const el = overlay?.querySelector('[data-scanner-status]');
    if (el) el.textContent = message;
  }

  async function startNative(videoEl) {
    const formats = [
      'ean_13',
      'ean_8',
      'upc_a',
      'upc_e',
      'code_128',
      'code_39',
      'qr_code',
    ];

    detector = new window.BarcodeDetector({ formats });
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    });

    videoEl.srcObject = stream;
    await videoEl.play();
    setStatus('Ready — hold barcode steady in the frame');

    const tick = async () => {
      if (!active || !detector) return;
      try {
        const codes = await detector.detect(videoEl);
        if (codes?.length) {
          const raw = codes[0].rawValue || codes[0].rawData;
          if (raw) {
            emit(String(raw));
            setStatus(`Scanned: ${raw}`);
          }
        }
      } catch {
        // Keep scanning
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
  }

  async function startHtml5() {
    const host = overlay.querySelector('#pos-scanner-html5');
    const videoEl = overlay.querySelector('[data-scanner-video]');
    if (videoEl) videoEl.hidden = true;
    if (host) host.hidden = false;

    const { Html5Qrcode } = await import('https://esm.sh/html5-qrcode@2.3.8');
    html5Qr = new Html5Qrcode('pos-scanner-html5');

    await html5Qr.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 280, height: 160 } },
      (decoded) => {
        emit(decoded);
        setStatus(`Scanned: ${decoded}`);
      },
      () => {},
    );

    setStatus('Ready — hold barcode steady in the frame');
  }

  async function start() {
    if (active) return;
    ensureOverlay();
    overlay.hidden = false;
    active = true;
    setStatus('Requesting camera permission…');

    video = overlay.querySelector('[data-scanner-video]');
    const html5Host = overlay.querySelector('#pos-scanner-html5');
    if (video) video.hidden = false;
    if (html5Host) {
      html5Host.hidden = true;
      html5Host.innerHTML = '';
    }

    if (!window.isSecureContext) {
      setStatus('Camera needs HTTPS (or localhost). Use manual entry below.');
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('Camera not available on this device. Use manual entry.');
      return;
    }

    try {
      if (typeof window.BarcodeDetector === 'function') {
        await startNative(video);
      } else {
        await startHtml5();
      }
    } catch (error) {
      console.error('[scanner]', error);
      setStatus(error?.message || 'Could not open camera. Check permissions.');
      onError?.(error?.message || 'Camera permission denied');
    }
  }

  async function stop() {
    active = false;
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }

    detector = null;

    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
    }

    if (video) {
      video.srcObject = null;
    }

    if (html5Qr) {
      try {
        const state = html5Qr.getState?.();
        if (state === 2 /* SCANNING */) await html5Qr.stop();
        else await html5Qr.stop().catch(() => {});
      } catch {
        // ignore
      }
      try {
        await html5Qr.clear();
      } catch {
        // ignore
      }
      html5Qr = null;
    }

    if (overlay) overlay.hidden = true;
  }

  return {
    start,
    stop,
    isActive: () => active,
  };
}
