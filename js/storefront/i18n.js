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
      ritual: 'Home',
      contact: 'Contact',
      openMenu: 'Open menu',
      closeMenu: 'Close menu',
      cart: 'Shopping bag',
      home: 'Shamaadan home',
      tabHome: 'Home',
      tabBag: 'Bag',
      switchLang: 'Switch language',
    },
    lang: { en: 'EN', ar: 'عربي' },
    hero: {
      eyebrow: 'Home goods · Benghazi',
      title: 'From candles to <em>home</em>',
      desc: 'Opened in 2016 as Libya’s first candle shop, Shamaadan has grown into a home goods destination for accessories and furniture pieces.',
      ctaShop: 'Shop Collection',
      ctaRitual: 'Our Story',
      statSince: 'Opened',
      statScents: "Libya's first candle shop",
      statOils: 'Home goods today',
      statRating: 'Customer rating',
      scroll: 'Scroll',
    },
    marquee: [
      'Libya’s first candle shop',
      'Home accessories & furniture',
      'Open since 2016',
      'Same-day Benghazi delivery',
    ],
    ethos: {
      quote: '"Every home<br>deserves a<br>warm light."',
      eyebrow: 'Our story',
      title: 'Grown with intention',
      lead: 'Opened in 2016, Shamaadan has evolved from Libya’s first candle shop into a home goods shop with accessories and furniture pieces.',
      p1Title: 'Roots in candles',
      p1Desc: 'We began as Libya’s first dedicated candle shop, building a craft and community around light and atmosphere.',
      p2Title: 'Home accessories',
      p2Desc: 'Today we curate pieces that finish a room — décor, gifts, and everyday objects chosen with care.',
      p3Title: 'Furniture pieces',
      p3Desc: 'From statement accents to practical furniture, we help you furnish a space that feels like home.',
    },
    collections: {
      eyebrow: 'Curated for you',
      title: 'Collections',
      viewAll: 'View all',
      pieces: 'pieces',
      explore: 'Explore',
      candles: 'Candles',
      incense: 'Accessories',
      oils: 'Furniture',
    },
    shop: {
      eyebrow: 'The boutique',
      title: 'Shop the edit',
      lead: 'Candles, accessories, and furniture pieces for your home.',
      filterLabel: 'Filter by category',
      all: 'All',
      empty: 'No products in this collection yet.',
      add: 'Add',
      bag: '+ Bag',
      new: 'New',
      added: 'Added ✦',
      addedToast: '{name} added to bag',
      outOfStock: 'Out of Stock',
      onlyOneLeft: 'Only 1 left',
      lowStock: 'Only {count} left',
      maxStock: 'Only {count} available',
    },
    checkout: {
      title: 'Checkout',
      empty: 'Your bag is empty',
      emptyHint: 'Add items from the shop to continue.',
      continueShopping: 'Continue shopping',
      subtotal: 'Subtotal',
      shipping: 'Shipping',
      shippingFree: 'Free',
      shippingCalc: 'Calculated at checkout',
      total: 'Total',
      contact: 'Contact details',
      fullName: 'Full name',
      phone: 'Phone number',
      email: 'Email address',
      address: 'Delivery address',
      city: 'City',
      payment: 'Payment method',
      cad: 'CAD',
      cadDesc: 'Cash on Delivery — pay when your order arrives',
      upay: 'UPAY',
      upayDesc: 'Pay securely with your credit or debit card',
      cardName: 'Name on card',
      cardNumber: 'Card number',
      cardExpiry: 'MM / YY',
      cardCvc: 'CVC',
      placeOrder: 'Place order',
      processing: 'Processing…',
      successTitle: 'Order confirmed',
      successCad: 'Your order is confirmed. Please prepare cash payment upon delivery.',
      successUpay: 'Payment received via UPAY. Your order is on its way.',
      orderRef: 'Order reference',
      close: 'Close',
      remove: 'Remove',
      qty: 'Quantity',
      errorRequired: 'Please fill in all required fields.',
      errorCard: 'Please enter valid card details.',
      errorGeneric: 'Something went wrong. Please try again.',
    },
    ritual: {
      eyebrow: 'Style your space',
      title: 'Three ways to feel at home',
      lead: 'Simple ideas to bring warmth, light, and comfort into every room.',
      s1Title: 'Start with light',
      s1Desc: 'A candle or lamp sets the mood — soft light makes any corner feel intentional.',
      s2Title: 'Add the details',
      s2Desc: 'Accessories, trays, and décor pieces tie the room together without overcrowding it.',
      s3Title: 'Anchor with furniture',
      s3Desc: 'Choose furniture pieces that serve daily life and give the space its character.',
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
      tagline: 'Libya’s first candle shop, now a home goods destination in Benghazi.',
      visit: 'Visit us',
      location: 'Benghazi, Venice Street, My Home intersection directly opposite the mosque, next to Cafe Della Palma, below World of Skewers Restaurant.',
      phone: '091-0229971',
      phoneLabel: 'Call us',
      shop: 'Shop',
      house: 'House',
      support: 'Support',
      allProducts: 'All products',
      giftSets: 'Gift sets',
      newArrivals: 'New arrivals',
      ourStory: 'Our story',
      theRitual: 'Style your space',
      sustainability: 'Sustainability',
      stockists: 'Stockists',
      shipping: 'Shipping',
      returns: 'Returns',
      faq: 'FAQ',
      rights: 'All rights reserved.',
      crafted: 'Crafted with intention in Libya',
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
      ritual: 'المنزل',
      contact: 'تواصل',
      openMenu: 'فتح القائمة',
      closeMenu: 'إغلاق القائمة',
      cart: 'سلة التسوق',
      home: 'شمعدان — الرئيسية',
      tabHome: 'الرئيسية',
      tabBag: 'السلة',
      switchLang: 'تغيير اللغة',
    },
    lang: { en: 'EN', ar: 'عربي' },
    hero: {
      eyebrow: 'مستلزمات منزلية · بنغازي',
      title: 'من الشموع إلى <em>المنزل</em>',
      desc: 'افتُتحت شمعدان عام ٢٠١٦ كأول متجر شموع في ليبيا، وتطورت إلى متجر مستلزمات منزلية يضم الإكسسوارات وقطع الأثاث.',
      ctaShop: 'تسوق المجموعة',
      ctaRitual: 'قصتنا',
      statSince: 'الافتتاح',
      statScents: 'أول متجر شموع في ليبيا',
      statOils: 'مستلزمات منزلية اليوم',
      statRating: 'تقييم العملاء',
      scroll: 'مرر',
    },
    marquee: [
      'أول متجر شموع في ليبيا',
      'إكسسوارات وأثاث منزلي',
      'مفتوحون منذ ٢٠١٦',
      'توصيل في نفس اليوم بنغازي',
    ],
    ethos: {
      quote: '"كل منزل<br>يستحق<br>دفء الضوء."',
      eyebrow: 'قصتنا',
      title: 'نموّ بنية واعية',
      lead: 'افتُتحت شمعدان عام ٢٠١٦ وتطورت من أول متجر شموع في ليبيا إلى متجر مستلزمات منزلية يضم الإكسسوارات وقطع الأثاث.',
      p1Title: 'جذورنا في الشموع',
      p1Desc: 'بدأنا كأول متجر متخصص بالشموع في ليبيا، وبنينا مجتمعاً حول الضوء والأجواء الدافئة.',
      p2Title: 'إكسسوارات المنزل',
      p2Desc: 'نختار اليوم قطعاً تُكمل الغرفة — ديكور وهدايا وأغراض يومية بعناية.',
      p3Title: 'قطع الأثاث',
      p3Desc: 'من الإكسسوارات المميزة إلى الأثاث العملي، نساعدك على تجهيز مساحة تشعر فيها بالمنزل.',
    },
    collections: {
      eyebrow: 'منتقى لك',
      title: 'المجموعات',
      viewAll: 'عرض الكل',
      pieces: 'قطعة',
      explore: 'استكشف',
      candles: 'الشموع',
      incense: 'الإكسسوارات',
      oils: 'الأثاث',
    },
    shop: {
      eyebrow: 'البوتيك',
      title: 'تسوق المختارات',
      lead: 'شموع وإكسسوارات وقطع أثاث لمنزلك.',
      filterLabel: 'تصفية حسب الفئة',
      all: 'الكل',
      empty: 'لا توجد منتجات في هذه المجموعة بعد.',
      add: 'أضف',
      bag: '+ سلة',
      new: 'جديد',
      added: 'تمت الإضافة ✦',
      addedToast: 'تمت إضافة {name} إلى السلة',
      outOfStock: 'نفدت الكمية',
      onlyOneLeft: 'تبقى قطعة واحدة',
      lowStock: 'تبقى {count} فقط',
      maxStock: 'المتوفر {count} فقط',
    },
    checkout: {
      title: 'إتمام الطلب',
      empty: 'سلتك فارغة',
      emptyHint: 'أضف منتجات من المتجر للمتابعة.',
      continueShopping: 'متابعة التسوق',
      subtotal: 'المجموع الفرعي',
      shipping: 'الشحن',
      shippingFree: 'مجاني',
      shippingCalc: 'يُحسب عند الدفع',
      total: 'الإجمالي',
      contact: 'بيانات التواصل',
      fullName: 'الاسم الكامل',
      phone: 'رقم الهاتف',
      email: 'البريد الإلكتروني',
      address: 'عنوان التوصيل',
      city: 'المدينة',
      payment: 'طريقة الدفع',
      cad: 'CAD',
      cadDesc: 'الدفع عند الاستلام — ادفع نقداً عند وصول طلبك',
      upay: 'UPAY',
      upayDesc: 'ادفع بأمان ببطاقة الائتمان أو الخصم',
      cardName: 'الاسم على البطاقة',
      cardNumber: 'رقم البطاقة',
      cardExpiry: 'شهر / سنة',
      cardCvc: 'رمز الأمان',
      placeOrder: 'تأكيد الطلب',
      processing: 'جاري المعالجة…',
      successTitle: 'تم تأكيد الطلب',
      successCad: 'تم تأكيد طلبك. يرجى تجهيز المبلغ نقداً عند التوصيل.',
      successUpay: 'تم استلام الدفع عبر UPAY. طلبك في الطريق.',
      orderRef: 'رقم الطلب',
      close: 'إغلاق',
      remove: 'إزالة',
      qty: 'الكمية',
      errorRequired: 'يرجى تعبئة جميع الحقول المطلوبة.',
      errorCard: 'يرجى إدخال بيانات بطاقة صحيحة.',
      errorGeneric: 'حدث خطأ. يرجى المحاولة مرة أخرى.',
    },
    ritual: {
      eyebrow: 'أنسق مساحتك',
      title: 'ثلاث طرق لتشعر بالمنزل',
      lead: 'أفكار بسيطة لإضفاء الدفء والضوء والراحة على كل غرفة.',
      s1Title: 'ابدأ بالضوء',
      s1Desc: 'شمعة أو إضاءة ناعمة تضبط المزاج وتجعل أي ركن يبدو مقصوداً.',
      s2Title: 'أضف التفاصيل',
      s2Desc: 'الإكسسوارات والصواني وقطع الديكور تربط الغرفة دون إرهاقها.',
      s3Title: 'ثبّت بالأثاث',
      s3Desc: 'اختر قطع أثاث تخدم يومك وتعطي المساحة شخصيتها.',
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
      tagline: 'أول متجر شموع في ليبيا، واليوم وجهة للمستلزمات المنزلية في بنغازي.',
      visit: 'زورونا',
      location: 'بنغازي، شارع البندقية، تقاطع ماي هوم مقابل المسجد مباشرة، بجوار كافيه ديلا بالما للآيس كريم، وأسفل مطعم عالم الأسياخ.',
      phone: '091-0229971',
      phoneLabel: 'اتصل بنا',
      shop: 'تسوق',
      house: 'الدار',
      support: 'الدعم',
      allProducts: 'كل المنتجات',
      giftSets: 'مجموعات الهدايا',
      newArrivals: 'وصل حديثاً',
      ourStory: 'قصتنا',
      theRitual: 'أنسق مساحتك',
      sustainability: 'الاستدامة',
      stockists: 'نقاط البيع',
      shipping: 'الشحن',
      returns: 'الإرجاع',
      faq: 'الأسئلة الشائعة',
      rights: 'جميع الحقوق محفوظة.',
      crafted: 'صُنع بنية في ليبيا',
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

  let locale = initialLocale || getStoredLocale() || detectLocale();

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
    const loc = locale === 'ar' ? 'ar-LY' : 'en-LY';
    return new Intl.NumberFormat(loc, {
      style: 'currency',
      currency: 'LYD',
      minimumFractionDigits: 2,
    }).format(Number(amount) || 0);
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
