/**
 * Smooth scroll via Lenis, synced with GSAP ScrollTrigger.
 */

let lenisInstance = null;

/**
 * @returns {Promise<object | null>}
 */
export async function initSmoothScroll() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    bindSmoothScrollAnchors(null);
    return null;
  }

  try {
    const Lenis = (await import('https://esm.sh/lenis@1.1.18')).default;

    const lenis = new Lenis({
      duration: 1.15,
      easing: (t) => Math.min(1, 1.001 - 2 ** (-10 * t)),
      smoothWheel: true,
      touchMultiplier: 1.8,
    });

    lenisInstance = lenis;

    function raf(time) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }
    requestAnimationFrame(raf);
    bindSmoothScrollAnchors(lenis);

    return lenis;
  } catch (error) {
    console.warn('[scroll] Lenis unavailable, using native scroll.', error);
    bindSmoothScrollAnchors(null);
    return null;
  }
}

/**
 * Wire Lenis scroll position into ScrollTrigger.
 * @param {object | null} lenis
 */
export function syncScrollTrigger(lenis) {
  if (!lenis) return;

  import('https://esm.sh/gsap@3.12.5/ScrollTrigger').then(({ ScrollTrigger }) => {
    lenis.on('scroll', ScrollTrigger.update);
    ScrollTrigger.scrollerProxy(document.body, {
      scrollTop(value) {
        if (arguments.length) {
          lenis.scrollTo(value, { immediate: true });
        }
        return lenis.scroll;
      },
      getBoundingClientRect() {
        return { top: 0, left: 0, width: window.innerWidth, height: window.innerHeight };
      },
    });
    ScrollTrigger.addEventListener('refresh', () => lenis.resize());
    ScrollTrigger.refresh();
  });
}

export function getLenis() {
  return lenisInstance;
}

/** Document-level anchor scrolling — survives DOM re-renders. */
function bindSmoothScrollAnchors(lenis) {
  if (bindSmoothScrollAnchors._bound) return;
  bindSmoothScrollAnchors._bound = true;

  document.addEventListener('click', (event) => {
    const anchor = event.target.closest('#app-root a[href^="#"]');
    if (!anchor) return;

    const id = anchor.getAttribute('href');
    if (!id || id === '#') return;
    const target = document.querySelector(id);
    if (!target) return;

    event.preventDefault();
    const instance = lenisInstance ?? lenis;
    if (instance) {
      instance.scrollTo(target, { offset: -72, duration: 1.2 });
    } else {
      target.scrollIntoView({ behavior: 'smooth' });
    }
  });
}

export function destroySmoothScroll() {
  if (lenisInstance) {
    lenisInstance.destroy();
    lenisInstance = null;
  }
}
