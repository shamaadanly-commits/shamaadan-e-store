/**
 * Bilingual i18n — English & Arabic with RTL support.
 */
const STORAGE_KEY = 'shamaadan-lang';

const MESSAGES = {
  en: {
    meta: { title: 'Shamaadan — Shop', dir: 'ltr', lang: 'en' },
    skip: 'Skip to content',
    nav: {
      primary: 'Primary',
      mobile: 'Mobile',
      collections: 'Collections',
      shop: 'Shop',
      ritual: 'Ritual',
      contact: 'Contact',
      openMenu: 'Open menu',
      closeMenu: 'Close menu',
      cart: 'Shopping bag',
      home: 'Shamaadan home',
      switchLang: 'Switch language',
    },
    lang: { en: 'EN', ar: 'عربي' },
    hero: {
      eyebrow: 'Luxury fragrance house',
      title: 'Scent as <em>ritual</em>',
      desc: 'Hand-crafted oud, incense, and candles — composed for those who treat every evening as a ceremony.',
      ctaShop: 'Shop Collection',
      ctaRitual: 'Our Ritual',
      statScents: 'Curated scents',
      statOils: 'Natural oils',
      statRating: 'Customer rating',
      scroll: 'Scroll',
    },
    marquee: [
      'Free shipping over $75',
      'Hand-poured in small batches',
      'Sustainably sourced oud',
      'Complimentary gift wrapping',
      'Same-day Dubai delivery',
    ],
    ethos: {
      quote: '"Every flame<br>is an invitation<br>to pause."',
      eyebrow: 'Our ethos',
      title: 'Crafted with intention',
      lead: 'Shamaadan sources rare oud, amber, and rose taif from trusted ateliers across the Gulf — blended in micro-batches to preserve depth and longevity.',
      p1Title: 'Small-batch atelier',
      p1Desc: 'Each product is poured, packed, and numbered by hand in our Dubai studio.',
      p2Title: 'Ethically sourced',
      p2Desc: 'We partner directly with growers — no middlemen, no compromise on purity.',
      p3Title: 'Designed to linger',
      p3Desc: 'Formulations built for throw, burn-time, and the slow unfurling of top notes.',
    },
    collections: {
      eyebrow: 'Curated for you',
      title: 'Collections',
      viewAll: 'View all',
      pieces: 'pieces',
      explore: 'Explore',
      candles: 'Signature Candles',
      incense: 'Incense & Bakhoor',
      oils: 'Attars & Oils',
    },
    shop: {
      eyebrow: 'The boutique',
      title: 'Shop the edit',
      lead: 'Tap to add — complimentary gift wrapping on every order.',
      filterLabel: 'Filter by category',
      all: 'All',
      empty: 'No products in this collection yet.',
      add: 'Add',
      bag: '+ Bag',
      new: 'New',
      added: 'Added ✦',
      addedToast: '{name} added to bag',
    },
    ritual: {
      eyebrow: 'The evening ritual',
      title: 'Three movements of scent',
      lead: 'A guided sequence to transform your space from day to sanctuary.',
      s1Title: 'Clear the air',
      s1Desc: 'Light a sandalwood base to neutralize and open the room.',
      s2Title: 'Layer the heart',
      s2Desc: 'Add bakhoor or incense — let the middle notes bloom for ten minutes.',
      s3Title: 'Seal with oud',
      s3Desc: 'Finish with a single drop of attar on pulse points. The scent will anchor for hours.',
    },
    newsletter: {
      eyebrow: 'Stay in the circle',
      title: 'Private releases & rituals',
      lead: 'Be first to discover limited editions, seasonal blends, and invitation-only events.',
      placeholder: 'Your email address',
      emailLabel: 'Email address',
      submit: 'Subscribe',
      welcome: 'Welcome ✦',
    },
    footer: {
      tagline: 'Luxury fragrance & home rituals — composed in Dubai, delivered worldwide.',
      shop: 'Shop',
      house: 'House',
      support: 'Support',
      allProducts: 'All products',
      giftSets: 'Gift sets',
      newArrivals: 'New arrivals',
      ourStory: 'Our story',
      theRitual: 'The ritual',
      sustainability: 'Sustainability',
      stockists: 'Stockists',
      shipping: 'Shipping',
      returns: 'Returns',
      faq: 'FAQ',
      rights: 'All rights reserved.',
      crafted: 'Crafted with intention in Dubai',
      instagram: 'Instagram',
      tiktok: 'TikTok',
      pinterest: 'Pinterest',
    },
    categories: {
      All: 'All',
      Candles: 'Candles',
      Diffusers: 'Diffusers',
      Incense: 'Incense',
      Sprays: 'Sprays',
      Sets: 'Sets',
      Bakhoor: 'Bakhoor',
      Accessories: 'Accessories',
      Oils: 'Oils',
      General: 'General',
    },
    products: {
      p1: 'Oud Noir Candle',
      p2: 'Amber Musk Diffuser',
      p3: 'Rose Taif Incense',
      p4: 'Sandalwood Room Spray',
      p5: 'Gift Set — Classic',
      p6: 'Bakhoor Mini Pack',
      p7: 'Ceramic Burner',
      p8: 'Musk Oil 12ml',
    },
  },

  ar: {
    meta: { title: 'شمعدان — المتجر', dir: 'rtl', lang: 'ar' },
    skip: 'تخطي إلى المحتوى',
    nav: {
      primary: 'القائمة الرئيسية',
      mobile: 'القائمة',
      collections: 'المجموعات',
      shop: 'تسوق',
      ritual: 'الطقس',
      contact: 'تواصل',
      openMenu: 'فتح القائمة',
      closeMenu: 'إغلاق القائمة',
      cart: 'سلة التسوق',
      home: 'شمعدان — الرئيسية',
      switchLang: 'تغيير اللغة',
    },
    lang: { en: 'EN', ar: 'عربي' },
    hero: {
      eyebrow: 'دار عطور فاخرة',
      title: 'العبير <em>كطقس</em>',
      desc: 'عود وبخور وشموع مصنوعة يدوياً — لمن يحوّل كل أمسية إلى طقس.',
      ctaShop: 'تسوق المجموعة',
      ctaRitual: 'طقسنا',
      statScents: 'عطر منتقى',
      statOils: 'زيوت طبيعية',
      statRating: 'تقييم العملاء',
      scroll: 'مرر',
    },
    marquee: [
      'شحن مجاني فوق ٧٥$',
      'صب يدوي بدفعات صغيرة',
      'عود مستدام المصدر',
      'تغليف هدايا مجاني',
      'توصيل في نفس اليوم — دبي',
    ],
    ethos: {
      quote: '"كل لهب<br>دعوة<br>للتوقف."',
      eyebrow: 'فلسفتنا',
      title: 'صُنع بنية واعية',
      lead: 'تستورد شمعدان العود والعنبر وورد الطائف النادر من أفضل المشاغل في الخليج — تُمزج بدفعات صغيرة لتحافظ على العمق والثبات.',
      p1Title: 'مشغل بدفعات محدودة',
      p1Desc: 'كل منتج يُصب ويُعبأ ويُرقّم يدوياً في استوديونا بدبي.',
      p2Title: 'مصادر أخلاقية',
      p2Desc: 'نتعاون مباشرة مع المزارعين — بلا وسطاء، بلا تنازل عن النقاء.',
      p3Title: 'مصمم للبقاء',
      p3Desc: 'تركيبات مبنية للانتشار ووقت الاحتراق وانسياب النوتات الوسطى.',
    },
    collections: {
      eyebrow: 'منتقى لك',
      title: 'المجموعات',
      viewAll: 'عرض الكل',
      pieces: 'قطعة',
      explore: 'استكشف',
      candles: 'الشموع المميزة',
      incense: 'البخور والعود',
      oils: 'العطور والزيوت',
    },
    shop: {
      eyebrow: 'البوتيك',
      title: 'تسوق المختارات',
      lead: 'انقر للإضافة — تغليف هدايا مجاني مع كل طلب.',
      filterLabel: 'تصفية حسب الفئة',
      all: 'الكل',
      empty: 'لا توجد منتجات في هذه المجموعة بعد.',
      add: 'أضف',
      bag: '+ سلة',
      new: 'جديد',
      added: 'تمت الإضافة ✦',
      addedToast: 'تمت إضافة {name} إلى السلة',
    },
    ritual: {
      eyebrow: 'طقس المساء',
      title: 'ثلاث حركات للعبير',
      lead: 'تسلسل موجّه لتحويل مساحتك من نهار إلى ملاذ.',
      s1Title: 'تنقية الجو',
      s1Desc: 'أشعل قاعدة صندل لتعقيم الجو وفتح المكان.',
      s2Title: 'طبقة القلب',
      s2Desc: 'أضف البخور — دع النوتات الوسطى تتفتح لعشر دقائق.',
      s3Title: 'الختام بالعود',
      s3Desc: 'اختم بقطرة عطر على نقاط النبض. سيبقى العبير لساعات.',
    },
    newsletter: {
      eyebrow: 'ابقَ في الحلقة',
      title: 'إصدارات وطقوس حصرية',
      lead: 'كن أول من يكتشف الإصدارات المحدودة والخلطات الموسمية والفعاليات الخاصة.',
      placeholder: 'بريدك الإلكتروني',
      emailLabel: 'البريد الإلكتروني',
      submit: 'اشترك',
      welcome: 'أهلاً بك ✦',
    },
    footer: {
      tagline: 'عطور وطقوس منزلية فاخرة — من دبي إلى العالم.',
      shop: 'تسوق',
      house: 'الدار',
      support: 'الدعم',
      allProducts: 'كل المنتجات',
      giftSets: 'مجموعات الهدايا',
      newArrivals: 'وصل حديثاً',
      ourStory: 'قصتنا',
      theRitual: 'الطقس',
      sustainability: 'الاستدامة',
      stockists: 'نقاط البيع',
      shipping: 'الشحن',
      returns: 'الإرجاع',
      faq: 'الأسئلة الشائعة',
      rights: 'جميع الحقوق محفوظة.',
      crafted: 'صُنع بنية في دبي',
      instagram: 'إنستغرام',
      tiktok: 'تيك توك',
      pinterest: 'بينتريست',
    },
    categories: {
      All: 'الكل',
      Candles: 'شموع',
      Diffusers: 'معاطر',
      Incense: 'بخور',
      Sprays: 'رذاذ',
      Sets: 'مجموعات',
      Bakhoor: 'بخور',
      Accessories: 'إكسسوارات',
      Oils: 'زيوت',
      General: 'عام',
    },
    products: {
      p1: 'شمعة عود نوار',
      p2: 'معطر عنبر مسك',
      p3: 'بخور ورد الطائف',
      p4: 'رذاذ صندل للغرف',
      p5: 'مجموعة هدايا — كلاسيك',
      p6: 'باقة بخور صغيرة',
      p7: 'مبخرة سيراميك',
      p8: 'زيت مسك ١٢ مل',
    },
  },
};

/**
 * @param {string} locale
 * @param {string} path - dot-separated key path
 */
function lookup(locale, path) {
  const keys = path.split('.');
  let node = MESSAGES[locale];
  for (const key of keys) {
    if (node == null || typeof node !== 'object') return undefined;
    node = node[key];
  }
  return node;
}

export function createI18n(initialLocale) {
  let locale = initialLocale || getStoredLocale() || detectLocale();
  const listeners = new Set();

  function getStoredLocale() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'en' || stored === 'ar') return stored;
    } catch { /* private browsing */ }
    return null;
  }

  function detectLocale() {
    const lang = navigator.language?.toLowerCase() ?? 'en';
    return lang.startsWith('ar') ? 'ar' : 'en';
  }

  function t(path, vars = {}) {
    let value = lookup(locale, path) ?? lookup('en', path) ?? path;
    if (typeof value === 'string') {
      Object.entries(vars).forEach(([key, val]) => {
        value = value.replace(`{${key}}`, String(val));
      });
    }
    return value;
  }

  function getLocale() {
    return locale;
  }

  function isRtl() {
    return locale === 'ar';
  }

  function getDir() {
    return isRtl() ? 'rtl' : 'ltr';
  }

  function setLocale(next) {
    if (next !== 'en' && next !== 'ar') return;
    if (next === locale) return;
    locale = next;
    try {
      localStorage.setItem(STORAGE_KEY, locale);
    } catch { /* ignore */ }
    listeners.forEach((fn) => fn(locale));
  }

  function toggleLocale() {
    setLocale(locale === 'en' ? 'ar' : 'en');
  }

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function applyToDocument(root) {
    const dir = getDir();
    const lang = locale;
    document.documentElement.setAttribute('dir', dir);
    document.documentElement.setAttribute('lang', lang);
    root.setAttribute('dir', dir);
    root.setAttribute('lang', lang);
    document.title = t('meta.title');
  }

  function translateCategory(category) {
    return t(`categories.${category}`) || category;
  }

  function translateProduct(product) {
    const translated = t(`products.${product.id}`);
    return {
      ...product,
      displayName: typeof translated === 'string' && translated !== `products.${product.id}`
        ? translated
        : product.name,
      displayCategory: translateCategory(product.category),
    };
  }

  function translateCollection(id) {
    return t(`collections.${id}`) || id;
  }

  function formatPrice(amount) {
    const loc = locale === 'ar' ? 'ar-AE' : 'en-US';
    return new Intl.NumberFormat(loc, { style: 'currency', currency: 'USD' }).format(amount);
  }

  return {
    t,
    getLocale,
    setLocale,
    toggleLocale,
    isRtl,
    getDir,
    subscribe,
    applyToDocument,
    translateCategory,
    translateProduct,
    translateCollection,
    formatPrice,
  };
}
