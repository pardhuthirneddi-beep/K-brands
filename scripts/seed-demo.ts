/**
 * Development sample catalogue.
 *
 * Every product/variant/coupon record written here is flagged `is_sample = 1`
 * with a `sample_note`, and all stock quantities are fictional. This script:
 *   - refuses to run against a production database unless
 *     `KBRANDS_ALLOW_SAMPLE_SEED=1` is set explicitly;
 *   - is idempotent (safe to re-run; it updates the same slugs);
 *   - never fabricates reviews, ratings, awards or partnerships.
 *
 * Replacing samples with verified data: docs/sample-data.md
 */
import { all, closeDb, get, insertRow, run, transaction, updateRow } from '../src/db/client.ts';
import { runMigrations } from '../src/db/migrate.ts';
import { ensureDefaults, setSetting } from '../src/domain/settings.ts';
import { bootstrapAdminFromEnv } from '../src/domain/auth.ts';

const isProd = process.env.NODE_ENV === 'production';
if (isProd && process.env.KBRANDS_ALLOW_SAMPLE_SEED !== '1') {
  console.error(
    '[seed] Refusing to seed sample catalogue records into a production database.\n' +
      '       Replace demo products with verified data instead (docs/sample-data.md).\n' +
      '       (KBRANDS_ALLOW_SAMPLE_SEED=1 overrides this for a deliberate staging load.)',
  );
  process.exit(1);
}

runMigrations();
ensureDefaults();

const now = new Date().toISOString();
const SAMPLE_NOTE = 'Demo record — pricing, imagery and stock are fictional. Not real inventory, not a product you can ship.';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  MEN'S-ONLY DEMO CATALOGUE
 *
 *  K-brands sells men's clothing only. This file is the single source of the demo
 *  catalogue: shirts (linen / casual / formal), polo t-shirts, t-shirts, trousers
 *  (chinos / jeans / shorts), sweatshirts & knitwear, jackets & overshirts.
 *
 *  It deliberately contains NO belts, bags, wallets, watches, jewellery, footwear,
 *  women's wear, cosmetics, electronics or home goods — not as a product, not as a
 *  category, not as a tag, not as copy. A guard at the end of this script re-scans
 *  every row it is about to write and fails the seed if any banned word appears, so
 *  the restriction survives future edits here.
 *
 *  Every record is flagged `is_sample = 1` with a `sample_note`, and "photo" rows
 *  point at clearly-labelled demo imagery, never at a claim about a stocked item.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Words that must never appear in the customer-facing catalogue. */
const BANNED = [
  'belt', 'bag', 'wallet', 'purse', 'watch', 'jewellery', 'jewelry', 'bracelet', 'ring',
  'shoe', 'sneaker', 'loafer', 'boot', 'footwear', 'sandal',
  'women', 'woman', 'ladies', "men's wear for women", 'saree', 'kurta for women',
  'cosmetic', 'fragrance', 'perfume', 'makeup', 'lipstick',
  'electronics', 'gadget', 'headphone', 'speaker', 'phone case', 'charger',
  'home decor', 'cushion', 'bedding', 'mug', 'candle', 'towel',
  'scarf', 'scarves', 'stole', 'waistcoat', 'vest', 'necktie', 'pocket square', 'sock', 'cap', 'hat', 'beanie',
  'sunglass', 'glove', 'lanyard', 'keychain', 'umbrella', 'belt bag',
];

/**
 * Textile terms that merely share letters with a banned category. Removing them first
 * keeps "ring-spun yarn" from reading as jewellery.
 */
const ALLOW_PHRASES = [/ring[- ]?spun/gi, /cap[- ]?sized/gi, /belting/gi];

/**
 * BANNED is matched on word boundaries (and tolerates a trailing "s"), because a plain
 * substring test calls "that" a hat and "purchasing" a ring. Still a blunt instrument by
 * design: it is the last line of defence on demo data, while the real restriction lives
 * in the storefront category allowlist in src/domain/catalog.ts.
 */
const BANNED_RES = BANNED.map((w) => new RegExp(`\\b${w}s?\\b`, 'i'));

function bannedHit(input: string): string | null {
  const text = ALLOW_PHRASES.reduce((acc, re) => acc.replace(re, '  '), input);
  for (let i = 0; i < BANNED.length; i += 1) {
    if (BANNED_RES[i]!.test(text)) return BANNED[i]!;
  }
  return null;
}

/** Category slugs this catalogue is allowed to contain. Anything else is off-brand. */
const ALLOWED_CATEGORY_SLUGS = [
  'shirts', 'linen-shirts', 'casual-shirts', 'formal-shirts',
  'polos', 't-shirts',
  'trousers', 'chinos', 'jeans', 'shorts',
  'sweatshirts-knitwear', 'jackets-overshirts',
];

type Category = {
  slug: string;
  name: string;
  description: string;
  sort: number;
  /** Parent category slug — children are included when the parent is browsed. */
  parent?: string;
};

const CATEGORIES: Category[] = [
  {
    slug: 'shirts',
    name: 'Shirts',
    description: 'Linen, oxford and poplin shirts cut for the Indian working week.',
    sort: 10,
  },
  {
    slug: 'linen-shirts',
    name: 'Linen Shirts',
    parent: 'shirts',
    description: 'Pure linen and linen-cotton weaves that breathe in humidity.',
    sort: 11,
  },
  {
    slug: 'casual-shirts',
    name: 'Casual Shirts',
    parent: 'shirts',
    description: 'Brushed cotton, checks and everyday open-collar shirts.',
    sort: 12,
  },
  {
    slug: 'formal-shirts',
    name: 'Formal Shirts',
    parent: 'shirts',
    description: 'Two-ply poplin and structured collars for the office.',
    sort: 13,
  },
  {
    slug: 'polos',
    name: 'Polo T-Shirts',
    description: 'Piqué and fine-gauge knitted polos with collars that hold shape.',
    sort: 20,
  },
  {
    slug: 't-shirts',
    name: 'T-Shirts',
    description: 'Weighted combed-cotton tees, crew neck, no graphics.',
    sort: 30,
  },
  {
    slug: 'trousers',
    name: 'Trousers',
    description: 'Chinos, denim, tailored trousers and shorts in one place.',
    sort: 40,
  },
  {
    slug: 'chinos',
    name: 'Chinos',
    parent: 'trousers',
    description: 'Cotton twill in slim and classic legs.',
    sort: 41,
  },
  {
    slug: 'jeans',
    name: 'Jeans',
    parent: 'trousers',
    description: 'Rigid and stretch denim, straight and slim legs.',
    sort: 42,
  },
  {
    slug: 'shorts',
    name: 'Shorts',
    parent: 'trousers',
    description: 'Above-the-knee shorts for weekends and travel.',
    sort: 43,
  },
  {
    slug: 'sweatshirts-knitwear',
    name: 'Sweatshirts & Knitwear',
    description: 'Loopback fleece and fine-gauge knits for air-conditioned rooms.',
    sort: 50,
  },
  {
    slug: 'jackets-overshirts',
    name: 'Jackets & Overshirts',
    description: 'Unstructured overshirts and light layering jackets.',
    sort: 60,
  },
];

type SampleProduct = {
  slug: string;
  title: string;
  subtitle: string;
  description: string;
  /** Category slug — always a leaf where one exists. */
  category: string;
  /** Drives the fit block, the illustration fallback and the garment facet. */
  garment: 'shirt' | 'polo' | 'tee' | 'trouser' | 'denim' | 'short' | 'sweatshirt' | 'knitwear' | 'overshirt';
  fabric: string;
  composition: string;
  fit: string;
  care: string;
  colorFamily: string;
  occasion: string;
  /** Integer paise, INR. */
  price: number;
  /** Only where a genuine markdown is intended; never used to fake urgency. */
  compareAt?: number;
  status: 'published' | 'draft' | 'archived' | 'out_of_stock';
  colors: { name: string; hex: string }[];
  sizes: string[];
  stockPattern: number[];
  soldOutSizes?: number[];
  lowStockSizes?: number[];
  featured?: boolean;
  isNew?: boolean;
  /** Days ago the piece "published" — powers the Newest sort honestly. */
  ageDays: number;
  /** True when a demo photograph for the lead colourway exists in public/media/demo. */
  photo?: boolean;
};

const TOP_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
const WAIST_SIZES = ['30', '32', '34', '36', '38'];

const PRODUCTS: SampleProduct[] = [
  {
    slug: 'pure-linen-shirt',
    title: 'Textured Pure Linen Shirt',
    subtitle: 'Open collar, garment-washed, sleeves rolled',
    description:
      'A demo shirt built to test the storefront: mid-weight European flax, garment-washed so the slub sits proud of the skin, single-needle side seams and a soft rolled placket. Cut with a touch of room through the chest for humidity, not for volume.',
    category: 'linen-shirts',
    garment: 'shirt',
    fabric: 'Linen',
    composition: '100% linen, 165 gsm (demo specification — verify before publishing)',
    fit: 'Regular',
    care: 'Machine wash cold on gentle, reshape while damp, warm iron. Linen relaxes with wear.',
    colorFamily: 'Ivory',
    occasion: 'Weekend',
    price: 340000,
    status: 'published',
    colors: [
      { name: 'Ivory', hex: '#efe9dd' },
      { name: 'Pale Sage', hex: '#b9c3ad' },
      { name: 'Stone', hex: '#b7b1a6' },
    ],
    sizes: TOP_SIZES,
    stockPattern: [8, 14, 18, 15, 9, 4],
    soldOutSizes: [5],
    featured: true,
    isNew: true,
    ageDays: 4,
    photo: true,
  },
  {
    slug: 'brushed-oxford-shirt',
    title: 'Brushed Cotton Oxford Shirt',
    subtitle: 'Button-down collar, mother-of-pearl style buttons',
    description:
      'A demo oxford in heavyweight brushed cotton with a natural collar roll and a box pleat across the back for reach. Worn tucked on a Thursday and open over a tee on a Sunday.',
    category: 'casual-shirts',
    garment: 'shirt',
    fabric: 'Oxford',
    composition: '100% combed cotton oxford, 140 gsm (demo specification)',
    fit: 'Regular',
    care: 'Machine wash cold, tumble dry low, iron damp.',
    colorFamily: 'Blue',
    occasion: 'Everyday',
    price: 280000,
    compareAt: 320000,
    status: 'published',
    colors: [
      { name: 'Sky', hex: '#a9c2d6' },
      { name: 'Optic White', hex: '#f4f2ec' },
      { name: 'Navy', hex: '#2c3a52' },
    ],
    sizes: TOP_SIZES,
    stockPattern: [10, 16, 20, 16, 10, 6],
    lowStockSizes: [5],
    featured: true,
    ageDays: 26,
    photo: true,
  },
  {
    slug: 'two-ply-poplin-shirt',
    title: 'Two-Ply Poplin Formal Shirt',
    subtitle: 'Pointed collar, mitred cuff, cut for tucking',
    description:
      'A demo formal shirt: two-ply Giza-style poplin with a fused-free collar that stands under a jacket, a longer tail that stays tucked, and a single-needle placket.',
    category: 'formal-shirts',
    garment: 'shirt',
    fabric: 'Poplin',
    composition: '100% long-staple cotton poplin (demo specification)',
    fit: 'Slim',
    care: 'Machine wash cold, hang dry, hot iron on the reverse.',
    colorFamily: 'White',
    occasion: 'Office',
    price: 320000,
    status: 'published',
    colors: [
      { name: 'White', hex: '#f6f4ef' },
      { name: 'Powder Blue', hex: '#c3d4e3' },
      { name: 'Charcoal', hex: '#40423f' },
    ],
    sizes: TOP_SIZES,
    stockPattern: [6, 12, 16, 14, 8, 3],
    soldOutSizes: [0],
    ageDays: 40,
    photo: true,
  },
  {
    slug: 'pima-pique-polo',
    title: 'Pima Cotton Piqué Polo',
    subtitle: 'Ribbed collar that keeps its shape',
    description:
      'A demo polo in 220 gsm piqué with a self-fabric collar stand and three-button placket. The knit is dense enough to hold its line after ten washes, light enough for a commute.',
    category: 'polos',
    garment: 'polo',
    fabric: 'Cotton piqué',
    composition: '94% pima cotton / 6% elastane in the collar (demo specification)',
    fit: 'Regular',
    care: 'Machine wash cold inside out, dry flat, do not wring the collar.',
    colorFamily: 'Navy',
    occasion: 'Everyday',
    price: 220000,
    status: 'published',
    colors: [
      { name: 'Navy', hex: '#26334a' },
      { name: 'Bone', hex: '#e8e2d5' },
      { name: 'Olive', hex: '#63684a' },
    ],
    sizes: TOP_SIZES,
    stockPattern: [12, 18, 22, 18, 12, 6],
    featured: true,
    isNew: true,
    ageDays: 2,
    photo: true,
  },
  {
    slug: 'fine-gauge-knit-polo',
    title: 'Fine-Gauge Knit Polo',
    subtitle: 'Cotton jersey with a soft open placket',
    description:
      'A demo knit polo: 14-gauge combed-cotton jersey, two buttons, no collar stiffness. It reads smarter than a tee and cooler than a shirt.',
    category: 'polos',
    garment: 'polo',
    fabric: 'Cotton jersey',
    composition: '100% combed cotton, 14-gauge (demo specification)',
    fit: 'Regular',
    care: 'Hand wash cold, dry flat, store folded rather than hung.',
    colorFamily: 'Charcoal',
    occasion: 'Evening',
    price: 260000,
    status: 'published',
    colors: [
      { name: 'Charcoal', hex: '#43454a' },
      { name: 'Sand', hex: '#c8b9a2' },
    ],
    sizes: TOP_SIZES,
    stockPattern: [6, 10, 12, 10, 6, 2],
    lowStockSizes: [5],
    isNew: true,
    ageDays: 6,
    photo: true,
  },
  {
    slug: 'heavyweight-crew-tee',
    title: 'Heavyweight Crew-Neck Tee',
    subtitle: '220 gsm, structured rib, twin-needle hem',
    description:
      'A demo tee built to hold its shape: ring-spun heavyweight cotton, a rib collar that does not stretch out, and a straight body that sits clean over the waistband.',
    category: 't-shirts',
    garment: 'tee',
    fabric: 'Heavyweight cotton',
    composition: '100% ring-spun cotton, 220 gsm (demo specification)',
    fit: 'Regular',
    care: 'Machine wash cold, tumble dry low. Pre-shrunk within 3%.',
    colorFamily: 'White',
    occasion: 'Everyday',
    price: 120000,
    status: 'published',
    colors: [
      { name: 'White', hex: '#f5f3ee' },
      { name: 'Ash Melange', hex: '#c9c6c0' },
      { name: 'Navy', hex: '#26334a' },
      { name: 'Black', hex: '#242424' },
    ],
    sizes: TOP_SIZES,
    stockPattern: [16, 24, 28, 24, 16, 10],
    ageDays: 55,
    photo: true,
  },
  {
    slug: 'essential-combed-tee',
    title: 'Combed Cotton Essential Tee',
    subtitle: 'Mid-weight matte jersey, everyday count',
    description:
      'A demo three-pack staple sold here as a single unit: combed cotton with a matte surface, cut slightly shorter in the body so it works untucked.',
    category: 't-shirts',
    garment: 'tee',
    fabric: 'Combed cotton',
    composition: '100% combed cotton, 180 gsm (demo specification)',
    fit: 'Slim',
    care: 'Machine wash cold with like colours, dry in shade.',
    colorFamily: 'Black',
    occasion: 'Everyday',
    price: 95000,
    compareAt: 120000,
    status: 'published',
    colors: [
      { name: 'Black', hex: '#242424' },
      { name: 'Olive', hex: '#5c6146' },
      { name: 'Bone', hex: '#e8e2d5' },
    ],
    sizes: TOP_SIZES,
    stockPattern: [12, 18, 22, 18, 10, 5],
    ageDays: 70,
    photo: true,
  },
  {
    slug: 'slim-cotton-chino',
    title: 'Slim Cotton Chino',
    subtitle: 'Cotton twill with a slight taper',
    description:
      'A demo chino in 9 oz cotton twill with a touch of stretch at the seat, a clean flat front and a hem cut to break once at the ankle.',
    category: 'chinos',
    garment: 'trouser',
    fabric: 'Cotton twill',
    composition: '97% cotton / 3% elastane (demo specification)',
    fit: 'Slim',
    care: 'Machine wash cold, hang dry, cool iron on the waistband.',
    colorFamily: 'Sand',
    occasion: 'Smart casual',
    price: 260000,
    status: 'published',
    colors: [
      { name: 'Sand', hex: '#c9b79c' },
      { name: 'Olive', hex: '#6a6c50' },
      { name: 'Navy', hex: '#28344a' },
      { name: 'Black', hex: '#26262a' },
    ],
    sizes: WAIST_SIZES,
    stockPattern: [10, 16, 18, 12, 7],
    featured: true,
    ageDays: 33,
    photo: true,
  },
  {
    slug: 'straight-leg-denim',
    title: 'Straight Leg Denim Jean',
    subtitle: 'Mid-indigo rigid twill, chain-stitched hem',
    description:
      'A demo jean in 12 oz mid-indigo cotton denim, straight through the thigh, no stretch and no distressing — the kind that fades along the lines you actually bend.',
    category: 'jeans',
    garment: 'denim',
    fabric: 'Cotton denim',
    composition: '100% cotton denim, 12 oz (demo specification)',
    fit: 'Straight',
    care: 'Wash cold inside out, rarely. Dry flat in shade to keep the indigo even.',
    colorFamily: 'Indigo',
    occasion: 'Everyday',
    price: 320000,
    status: 'published',
    colors: [
      { name: 'Mid Indigo', hex: '#3b4a63' },
      { name: 'Washed Black', hex: '#33333a' },
    ],
    sizes: WAIST_SIZES,
    stockPattern: [8, 14, 16, 12, 6],
    lowStockSizes: [4],
    isNew: true,
    ageDays: 9,
    photo: true,
  },
  {
    slug: 'pleated-smart-trouser',
    title: 'Pleated Smart-Casual Trouser',
    subtitle: 'Matte cotton blend, single pleat, sharp crease',
    description:
      'A demo trouser built for the in-between days: a matte cotton-linen blend suiting, one forward pleat for seat room, and a crease that holds through a full working day.',
    category: 'trousers',
    garment: 'trouser',
    fabric: 'Cotton-linen suiting',
    composition: '70% cotton / 30% linen (demo specification)',
    fit: 'Relaxed',
    care: 'Dry clean, or machine wash cold on gentle and press with a cloth.',
    colorFamily: 'Charcoal',
    occasion: 'Office',
    price: 340000,
    status: 'published',
    colors: [
      { name: 'Charcoal', hex: '#4a4b4d' },
      { name: 'Stone', hex: '#a9a297' },
    ],
    sizes: WAIST_SIZES,
    stockPattern: [6, 10, 12, 9, 4],
    ageDays: 18,
    photo: true,
  },
  {
    slug: 'loopback-sweatshirt',
    title: 'Loopback Cotton Sweatshirt',
    subtitle: 'Garment-dyed 400 gsm fleece, crew neck',
    description:
      'A demo sweatshirt in loopback fleece: brushed inside for warmth without bulk, ribbed cuffs that stay tight, and a dye that fades the way fleece should.',
    category: 'sweatshirts-knitwear',
    garment: 'sweatshirt',
    fabric: 'Loopback fleece',
    composition: '80% cotton / 20% recycled polyester (demo specification)',
    fit: 'Relaxed',
    care: 'Machine wash cold inside out, dry flat, do not iron the rib.',
    colorFamily: 'Grey',
    occasion: 'Weekend',
    price: 240000,
    status: 'published',
    colors: [
      { name: 'Fog Melange', hex: '#bdbcb7' },
      { name: 'Charcoal', hex: '#4a4b4d' },
      { name: 'Olive', hex: '#5f6549' },
    ],
    sizes: TOP_SIZES,
    stockPattern: [9, 14, 17, 14, 9, 5],
    isNew: true,
    ageDays: 1,
  },
  {
    slug: 'cotton-twill-overshirt',
    title: 'Cotton Twill Overshirt',
    subtitle: 'Worn as a jacket, layered like a shirt',
    description:
      'A demo overshirt in dry 10 oz cotton twill with two chest pockets, a straight hem and matte buttons, cut to go over a knit without pulling at the shoulder.',
    category: 'jackets-overshirts',
    garment: 'overshirt',
    fabric: 'Cotton twill',
    composition: '100% cotton twill, 10 oz (demo specification)',
    fit: 'Relaxed',
    care: 'Machine wash cold, hang dry, iron the collar flat.',
    colorFamily: 'Olive',
    occasion: 'Travel',
    price: 290000,
    compareAt: 340000,
    status: 'published',
    colors: [
      { name: 'Olive', hex: '#6b6f4e' },
      { name: 'Stone', hex: '#a9a297' },
      { name: 'Indigo', hex: '#39435c' },
    ],
    sizes: TOP_SIZES,
    stockPattern: [5, 11, 14, 11, 7, 3],
    lowStockSizes: [0],
    featured: true,
    ageDays: 12,
  },
  {
    slug: 'linen-cotton-shorts',
    title: 'Linen-Cotton Drawstring Shorts',
    subtitle: 'Above the knee, flat waistband, hidden drawcord',
    description:
      'A demo short in a linen-cotton blend that ends just above the knee, with a flat waistband and an internal drawcord so it works with a shirt or without one.',
    category: 'shorts',
    garment: 'short',
    fabric: 'Linen-cotton',
    composition: '55% linen / 45% cotton (demo specification)',
    fit: 'Regular',
    care: 'Machine wash cold, hang dry, warm iron while damp.',
    colorFamily: 'Stone',
    occasion: 'Weekend',
    price: 180000,
    status: 'published',
    colors: [
      { name: 'Stone', hex: '#bdb3a2' },
      { name: 'Navy', hex: '#28344a' },
      { name: 'Olive', hex: '#6a6c50' },
    ],
    sizes: TOP_SIZES,
    stockPattern: [8, 13, 15, 12, 8, 4],
    soldOutSizes: [5],
    isNew: true,
    ageDays: 3,
  },
];

const sizeGuideFor = (garment: SampleProduct['garment']): string => {
  if (garment === 'trouser' || garment === 'denim') return 'bottoms-waist';
  if (garment === 'short') return 'bottoms-shorts';
  return 'standard-tops';
};

/**
 * Where a demo photograph exists it lives at public/media/demo/<slug>.jpg and is
 * referenced from the product record (never hardcoded inside a component). Colourways
 * without photography fall back to the deterministic plate route, tinted to that exact
 * colour, so the frame a shopper sees always matches the swatch they picked.
 */
const PHOTOGRAPHED = new Set(PRODUCTS.filter((p) => p.photo).map((p) => p.slug));

function imagesFor(p: SampleProduct) {
  const lead = p.colors[0]!;
  const rows: { url: string; alt: string; kind: 'photo' | 'generated'; width: number; height: number }[] = [];
  if (PHOTOGRAPHED.has(p.slug)) {
    rows.push({
      url: `/media/demo/${p.slug}.jpg`,
      alt: `Demo visual: men's ${p.title.toLowerCase()} in ${lead.name}. Not verified product photography.`,
      kind: 'photo',
      width: 900,
      height: 1200,
    });
  }
  for (const c of p.colors) {
    rows.push({
      url: `/media/sample/${p.slug}/0.svg?garment=${p.garment}&c=${encodeURIComponent(c.hex)}&t=${encodeURIComponent(c.name)}`,
      alt: `Demo illustration of the ${p.title.toLowerCase()} in ${c.name}. Illustration, not a photograph.`,
      kind: 'generated',
      width: 900,
      height: 1200,
    });
  }
  return rows;
}

/**
 * Refuse to write an off-brand catalogue. This runs against the data structure
 * itself, so a future edit that reintroduces accessories or womenswear fails here
 * before it can ever reach a storefront.
 */
{
  const problems: string[] = [];
  for (const c of CATEGORIES) {
    if (!ALLOWED_CATEGORY_SLUGS.includes(c.slug)) problems.push(`category "${c.slug}" is not in the approved list`);
    const hit = bannedHit(`${c.name} ${c.description ?? ''}`);
    if (hit) problems.push(`category "${c.slug}" contains banned word "${hit}"`);
  }
  for (const p of PRODUCTS) {
    if (!ALLOWED_CATEGORY_SLUGS.includes(p.category)) problems.push(`product "${p.slug}" uses unapproved category`);
    const hit = bannedHit(
      [p.title, p.subtitle, p.description, p.fabric, p.care, p.occasion, p.fit, ...p.colors.map((c) => c.name)].join(' '),
    );
    if (hit) problems.push(`product "${p.slug}" mentions banned category "${hit}"`);
  }
  if (problems.length) {
    console.error('[seed] MEN’S-ONLY CATALOGUE GUARD FAILED:\n  - ' + problems.join('\n  - '));
    process.exit(1);
  }
}

let productCount = 0;
let variantCount = 0;
let prunedCount = 0;

transaction(() => {
  for (const c of CATEGORIES) {
    const parentId = c.parent
      ? get<{ id: number }>('SELECT id FROM categories WHERE slug = ?', [c.parent])?.id ?? null
      : null;
    const existing = get<{ id: number }>('SELECT id FROM categories WHERE slug = ?', [c.slug]);
    if (existing) {
      updateRow('categories', 'id', existing.id, {
        name: c.name,
        description: c.description,
        parent_id: parentId,
        sort_order: c.sort,
        updated_at: now,
      });
      continue;
    }
    insertRow('categories', {
      slug: c.slug,
      name: c.name,
      description: c.description,
      parent_id: parentId,
      sort_order: c.sort,
      meta_title: `${c.name} — K-brands menswear`,
      meta_description: c.description.slice(0, 150),
      created_at: now,
      updated_at: now,
    });
  }
});

for (const p of PRODUCTS) {
  transaction(() => {
    const categoryId = get<{ id: number }>('SELECT id FROM categories WHERE slug = ?', [p.category])?.id ?? null;
    const existing = get<{ id: number }>('SELECT id FROM products WHERE slug = ?', [p.slug]);
    const stamp = new Date(Date.now() - p.ageDays * 86400000).toISOString();
    const tags = ['demo', p.garment, p.occasion.toLowerCase().replace(/\s+/g, '-')];
    if (p.featured) tags.push('featured');
    if (p.isNew) tags.push('new');
    const fields = {
      slug: p.slug,
      title: p.title,
      subtitle: p.subtitle,
      description: `${p.description}\n\nDEMO RECORD — this product does not exist in the warehouse yet. Price, fabric, imagery and stock are placeholders for storefront development.`,
      category_id: categoryId,
      brand_line: 'K-brands',
      garment_type: p.garment,
      fit: p.fit,
      fabric: p.fabric,
      fabric_composition: p.composition,
      care: p.care,
      gender: 'men',
      color_family: p.colorFamily,
      occasion: p.occasion,
      price_cents: p.price,
      compare_at_price_cents: p.compareAt ?? null,
      currency: 'INR',
      tax_bps: 0,
      status: p.status,
      is_sample: 1,
      sample_note: SAMPLE_NOTE,
      size_guide_key: sizeGuideFor(p.garment),
    };
    let productId: number;
    if (existing) {
      productId = existing.id;
      updateRow('products', 'id', productId, { ...fields, updated_at: now });
      run('UPDATE products SET created_at = ?, published_at = ? WHERE id = ?', [stamp, stamp, productId]);
    } else {
      productId = insertRow('products', {
        ...fields,
        published_at: ['published', 'out_of_stock'].includes(p.status) ? stamp : null,
        created_at: stamp,
        updated_at: now,
      }).lastInsertRowid;
    }
    productCount += 1;

    run('DELETE FROM product_images WHERE product_id = ?', [productId]);
    imagesFor(p).forEach((img, i) => {
      insertRow('product_images', {
        product_id: productId,
        url: img.url,
        alt: img.alt,
        position: i,
        kind: img.kind,
        width: img.width,
        height: img.height,
      });
    });
    run('DELETE FROM product_tags WHERE product_id = ?', [productId]);
    for (const t of tags) run('INSERT OR IGNORE INTO product_tags (product_id, tag) VALUES (?, ?)', [productId, t]);

    // Clear any cart lines / reservations that point at the old variant ids
    // before recreating them, so a re-seed never breaks foreign keys.
    run(`DELETE FROM cart_lines WHERE variant_id IN (SELECT id FROM variants WHERE product_id = ?)`, [productId]);
    run(
      `DELETE FROM reservation_lines WHERE variant_id IN (SELECT id FROM variants WHERE product_id = ?)`,
      [productId],
    );
    run('DELETE FROM inventory_ledger WHERE variant_id IN (SELECT id FROM variants WHERE product_id = ?)', [
      productId,
    ]);
    run('DELETE FROM variants WHERE product_id = ?', [productId]);
    for (let ci = 0; ci < p.colors.length; ci += 1) {
      const color = p.colors[ci]!;
      for (let si = 0; si < p.sizes.length; si += 1) {
        const size = p.sizes[si]!;
        const soldOut = p.soldOutSizes?.includes(si) ?? false;
        const low = p.lowStockSizes?.includes(si) ?? false;
        const base = p.stockPattern[si] ?? 0;
        const qty = soldOut ? 0 : low ? Math.min(base, 2) : Math.max(0, base - ci);
        const sizeTok = size.toLowerCase().replace(/[^a-z0-9]/g, '');
        const colorTok = color.name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 6);
        const slugTok = p.slug.replace(/[^a-z]/g, '').slice(0, 10).toUpperCase();
        const sku = `KB-SMP-${slugTok}-${sizeTok}-${colorTok}`;
        const variantId = get<{ id: number }>('SELECT id FROM variants WHERE sku = ?', [sku])?.id;
        const variantFields = {
          sku,
          size,
          color_name: color.name,
          color_code: color.hex,
          material_variant: null,
          price_cents: null,
          compare_at_price_cents: null,
          stock_qty: qty,
          reserved_qty: 0,
          status: 'active',
          weight_grams: 420,
        };
        if (variantId) {
          updateRow('variants', 'id', variantId, { ...variantFields, updated_at: now });
        } else {
          const vres = insertRow('variants', {
            product_id: productId,
            ...variantFields,
            created_at: now,
            updated_at: now,
          });
          insertRow('inventory_ledger', {
            variant_id: vres.lastInsertRowid,
            change_qty: qty,
            reason: 'sample_seed',
            balance_after: qty,
            ref_type: 'seed',
            ref_id: 'seed-demo',
            note: 'Fictional demo stock — not real inventory',
            created_at: now,
          });
        }
        variantCount += 1;
      }
    }
  });
}

/**
 * Prune demo rows this catalogue no longer wants — that is how the retired
 * cashmere-scarf and waistcoat samples leave the storefront. Only `is_sample = 1`
 * rows are eligible, and only ones no order has ever referenced, so a customer's
 * order history can never lose a line. Anything referenced by an order is archived
 * instead of deleted.
 */
transaction(() => {
  const keep = new Set([...PRODUCTS.map((p) => p.slug), 'verified-product-placeholder']);
  const samples = all<{ id: number; slug: string; title: string }>(
    'SELECT id, slug, title FROM products WHERE is_sample = 1',
    [],
  );
  for (const row of samples) {
    if (keep.has(row.slug)) continue;
    const referenced = get<{ n: number }>('SELECT COUNT(*) AS n FROM order_lines WHERE product_id = ?', [
      row.id,
    ])?.n ?? 0;
    if (referenced > 0) {
      run("UPDATE products SET status = 'archived', updated_at = ? WHERE id = ?", [now, row.id]);
      console.log(`[seed] archived "${row.title}" (referenced by ${String(referenced)} order line(s))`);
      continue;
    }
    run('DELETE FROM products WHERE id = ?', [row.id]); // cascades to variants/images/tags
    prunedCount += 1;
    console.log(`[seed] removed retired demo row "${row.title}"`);
  }
});

/** Categories outside the approved menswear tree are emptied then dropped (samples only). */
transaction(() => {
  const allowed = new Set(ALLOWED_CATEGORY_SLUGS);
  const orphans = all<{ id: number; slug: string }>(
    `SELECT id, slug FROM categories WHERE slug NOT IN (${[...allowed].map(() => '?').join(',')})`,
    [...allowed],
  );
  for (const o of orphans) {
    const inUse = get<{ n: number }>('SELECT COUNT(*) AS n FROM products WHERE category_id = ?', [o.id])?.n ?? 0;
    if (inUse > 0) continue;
    run('DELETE FROM categories WHERE id = ?', [o.id]);
  }
});

/**
 * One NON-sample record so the admin list shows both classes side by side and the
 * isolation rules are visible in the UI. It stays in draft with zero price so it
 * can never be bought.
 */
transaction(() => {
  const slug = 'verified-product-placeholder';
  const existing = get<{ id: number }>('SELECT id FROM products WHERE slug = ?', [slug]);
  if (existing) return;
  const res = insertRow('products', {
    slug,
    title: 'Verified product (awaiting owner data)',
    subtitle: 'Replace this row with the first real product record',
    description:
      'This row is NOT a sample: it is a placeholder for the first verified product the owner supplies. Keep it in draft until price, fabric, imagery and stock are confirmed.',
    brand_line: 'K-brands',
    garment_type: 'shirt',
    price_cents: 0,
    currency: 'INR',
    tax_bps: 0,
    status: 'draft',
    is_sample: 0,
    created_at: now,
    updated_at: now,
  });
  insertRow('product_images', {
    product_id: res.lastInsertRowid,
    url: `/media/sample/verified-product-placeholder/0.svg?garment=shirt`,
    alt: 'Placeholder for a verified product',
    position: 0,
    kind: 'placeholder',
  });
});

/** Coupons — demo only, clearly marked is_sample so they can be spotted and removed. */
transaction(() => {
  const coupons = [
    { code: 'LAUNCH10', kind: 'percent', value: 1000, min: 200000, max: 100000 },
    { code: 'FREESHIP', kind: 'fixed', value: 15000, min: 19900, max: 15000 },
  ];
  for (const c of coupons) {
    const existing = get<{ id: number }>('SELECT id FROM coupons WHERE code = ?', [c.code]);
    if (existing) continue;
    insertRow('coupons', {
      code: c.code,
      kind: c.kind,
      value: c.value,
      min_subtotal_cents: c.min,
      max_discount_cents: c.max,
      per_user_limit: 1,
      used_count: 0,
      active: 1,
      is_sample: 1,
      created_at: now,
      updated_at: now,
    });
  }
});

setSetting(
  'catalog.sample_summary',
  { seededAt: now, products: productCount, variants: variantCount, note: SAMPLE_NOTE },
  { requiresReview: false },
);

const admin = bootstrapAdminFromEnv();
console.log(`[seed] sample catalogue: ${String(productCount)} products / ${String(variantCount)} variants (all is_sample=1)`);
console.log(`[seed] categories: ${String(CATEGORIES.length)}  ·  coupons: LAUNCH10, FREESHIP (is_sample=1)`);
console.log(
  `[seed] admin bootstrap: ${admin.created ? `done (${admin.reason})` : `skipped — ${admin.reason}`}. ` +
    'Create one with KBRANDS_BOOTSTRAP_ADMIN_EMAIL + KBRANDS_BOOTSTRAP_ADMIN_PASSWORD (min 14 chars).',
);
closeDb();

console.log(
  `[seed] menswear demo catalogue: ${String(productCount)} products, ${String(variantCount)} variants, ` +
    `${String(prunedCount)} retired demo row(s) removed. All rows flagged is_sample=1.`,
);
