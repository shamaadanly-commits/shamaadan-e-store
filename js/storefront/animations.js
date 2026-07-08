/**
 * GSAP + ScrollTrigger animations — hardware-accelerated transforms only.
 */

/**
 * @param {HTMLElement} root
 * @param {object | null} lenis
 */
export async function initAnimations(root, lenis) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    revealAllImmediately(root);
    return;
  }

  const { gsap } = await import('https://esm.sh/gsap@3.12.5');
  const { ScrollTrigger } = await import('https://esm.sh/gsap@3.12.5/ScrollTrigger');
  gsap.registerPlugin(ScrollTrigger);

  if (lenis) {
    lenis.on('scroll', ScrollTrigger.update);
  }

  const fadeUpEls = root.querySelectorAll('[data-animate="fade-up"]');
  fadeUpEls.forEach((el) => {
    const delay = parseFloat(el.dataset.delay ?? '0');
    const base = { y: 48, opacity: 0, duration: 1, delay, ease: 'power3.out' };

    if (el.closest('.hero')) {
      gsap.from(el, base);
    } else {
      gsap.from(el, {
        ...base,
        scrollTrigger: { trigger: el, start: 'top 88%', toggleActions: 'play none none reverse' },
      });
    }
  });

  const fadeEls = root.querySelectorAll('[data-animate="fade"]');
  fadeEls.forEach((el) => {
    const delay = parseFloat(el.dataset.delay ?? '0');
    gsap.from(el, {
      opacity: 0,
      duration: 1.2,
      delay,
      ease: 'power2.out',
    });
  });

  const fadeRightEls = root.querySelectorAll('[data-animate="fade-right"]');
  fadeRightEls.forEach((el) => {
    gsap.from(el, {
      x: -60,
      opacity: 0,
      duration: 1.1,
      ease: 'power3.out',
      scrollTrigger: { trigger: el, start: 'top 82%', toggleActions: 'play none none reverse' },
    });
  });

  const fadeLeftEls = root.querySelectorAll('[data-animate="fade-left"]');
  fadeLeftEls.forEach((el) => {
    gsap.from(el, {
      x: 60,
      opacity: 0,
      duration: 1.1,
      ease: 'power3.out',
      scrollTrigger: { trigger: el, start: 'top 82%', toggleActions: 'play none none reverse' },
    });
  });

  const staggerGrids = root.querySelectorAll('[data-animate="stagger-grid"]');
  staggerGrids.forEach((grid) => {
    const children = grid.children;
    gsap.from(children, {
      y: 40,
      opacity: 0,
      duration: 0.8,
      stagger: 0.12,
      ease: 'power3.out',
      scrollTrigger: { trigger: grid, start: 'top 85%', toggleActions: 'play none none reverse' },
    });
  });

  const productGrid = root.querySelector('[data-product-grid]');
  if (productGrid) {
    gsap.from(productGrid.children, {
      y: 36,
      opacity: 0,
      duration: 0.7,
      stagger: 0.06,
      ease: 'power3.out',
      scrollTrigger: { trigger: productGrid, start: 'top 88%', toggleActions: 'play none none reverse' },
    });
  }

  const parallaxEls = root.querySelectorAll('[data-parallax]');
  parallaxEls.forEach((el) => {
    const speed = parseFloat(el.dataset.parallax ?? '0.2');
    gsap.to(el, {
      y: () => window.innerHeight * speed,
      ease: 'none',
      scrollTrigger: {
        trigger: el.closest('.hero') ?? el,
        start: 'top top',
        end: 'bottom top',
        scrub: true,
      },
    });
  });

  const heroLogo = root.querySelector('.hero__logo-mark');
  if (heroLogo) {
    gsap.to(heroLogo, {
      y: -30,
      opacity: 0.04,
      ease: 'none',
      scrollTrigger: {
        trigger: heroLogo.closest('.hero'),
        start: 'top top',
        end: 'bottom top',
        scrub: true,
      },
    });
  }

  const ritualRing = root.querySelector('.ritual__visual-ring');
  if (ritualRing) {
    gsap.to(ritualRing, {
      rotation: 360,
      ease: 'none',
      scrollTrigger: {
        trigger: ritualRing,
        start: 'top bottom',
        end: 'bottom top',
        scrub: 1.5,
      },
    });
  }
}

/**
 * Re-render animations for dynamically filtered product grid.
 * @param {HTMLElement} gridEl
 */
export async function animateProductGrid(gridEl) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const { gsap } = await import('https://esm.sh/gsap@3.12.5');

  gsap.from(gridEl.children, {
    y: 24,
    opacity: 0,
    duration: 0.5,
    stagger: 0.04,
    ease: 'power3.out',
  });
}

function revealAllImmediately(root) {
  root.querySelectorAll('[data-animate]').forEach((el) => {
    el.style.opacity = '1';
    el.style.transform = 'none';
  });
}
