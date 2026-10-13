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
import { closeDb, get, insertRow, run, transaction, updateRow } from '../src/db/client.ts';
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
const SAMPLE_NOTE = 'Development sample — pricing, images and stock are fictional. Not real inventory.';

const CATEGORIES: { slug: string; name: string; description: string; sort: number }[] = [
  { slug: 'shirts', name: 'Shirts', description: 'Oxford, poplin and tropical-weight shirts cut for the working week.', sort: 1 },
  { slug: 'trousers', name: 'Trousers', description: 'Wool-blend tailoring, cotton chinos and pleated fronts.', sort: 2 },
  { slug: 'blazers-jackets', name: 'Blazers & Jackets', description: 'Unstructured jackets and layering pieces.', sort: 3 },
  { slug: 'knitwear', name: 'Knitwear', description: 'Merino, cotton and blends for air-conditioned rooms and commutes.', sort: 4 },
  { slug: 't-shirts', name: 'T-shirts', description: 'Elevated basics in combed cotton.', sort: 5 },
  {
    slug: 'wardrobe-essentials',
    name: 'Wardrobe Essentials',
    description: 'The pieces the rest of the week is built around.',
    sort: 6,
  },
];

type SampleProduct = {
  slug: string;
  title: string;
  subtitle: string;
  description: string;
  category: string;
  garment: string;
  fabric: string;
  composition: string;
  fit: string;
  care: string;
  colorFamily: string;
  occasion: string;
  price: number;
  compareAt?: number;
  status: 'published' | 'draft' | 'archived' | 'out_of_stock';
  colors: { name: string; hex: string }[];
  sizes: string[];
  stockPattern: number[];
  soldOutSizes?: number[];
  lowStockSizes?: number[];
  tags: string[];
};

const PRODUCTS: SampleProduct[] = [
  {
    slug: 'the-daily-oxford-shirt',
    title: 'The Daily Oxford Shirt',
    subtitle: 'Heavyweight oxford, button-down collar',
    description:
      'A sample product used to develop and test the storefront. The copy here describes the intended garment — it is not a claim about a stocked item.',
    category: 'shirts',
    garment: 'shirt',
    fabric: 'Oxford',
    composition: '100% cotton (fictional specification)',
    fit: 'Regular',
    care: 'Machine wash cold, hang dry (fictional)',
    colorFamily: 'White',
    occasion: 'Everyday',
    price: 340000,
    compareAt: 420000,
    status: 'published',
    colors: [
      { name: 'Optic White', hex: '#f4f2ec' },
      { name: 'Sky', hex: '#a9c2d6' },
      { name: 'Stone', hex: '#b7b1a6' },
    ],
    sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    stockPattern: [9, 14, 18, 12, 6, 0],
    soldOutSizes: [5],
    tags: ['sample', 'office'],
  },
  {
    slug: 'pleated-trouser-in-wool-blend',
    title: 'Pleated Trouser, Wool Blend',
    subtitle: 'Single forward pleat, side adjusters',
    description: 'Sample record. Demonstrates trouser sizing, size-guide blocks and multi-colour variants.',
    category: 'trousers',
    garment: 'trouser',
    fabric: 'Wool blend',
    composition: '62% wool / 38% polyester (fictional)',
    fit: 'Tailored',
    care: 'Dry clean only (fictional)',
    colorFamily: 'Charcoal',
    occasion: 'Office',
    price: 520000,
    status: 'published',
    colors: [
      { name: 'Charcoal', hex: '#3a3a3c' },
      { name: 'Sand', hex: '#c9b79a' },
    ],
    sizes: ['28', '30', '32', '34', '36', '38'],
    stockPattern: [4, 8, 11, 9, 3, 1],
    lowStockSizes: [5],
    tags: ['sample', 'tailoring'],
  },
  {
    slug: 'unstructured-linen-blazer',
    title: 'Unstructured Linen-Blend Blazer',
    subtitle: 'Half-canvas front, patch pockets',
    description: 'Sample record for a higher-ticket outer layer carrying a comparison price.',
    category: 'blazers-jackets',
    garment: 'blazer',
    fabric: 'Linen blend',
    composition: '55% linen / 45% cotton (fictional)',
    fit: 'Relaxed',
    care: 'Dry clean (fictional)',
    colorFamily: 'Sand',
    occasion: 'Occasion',
    price: 1240000,
    compareAt: 1490000,
    status: 'published',
    colors: [
      { name: 'Sand', hex: '#cbbda2' },
      { name: 'Midnight', hex: '#22252f' },
    ],
    sizes: ['S', 'M', 'L', 'XL'],
    stockPattern: [3, 5, 4, 2],
    tags: ['sample', 'occasion'],
  },
  {
    slug: 'merino-crew-knitwear',
    title: 'Merino Crew, Fine Gauge',
    subtitle: '19.5 micron merino, 12 gauge',
    description: 'Sample record. Exercises low-stock messaging and colour swatches.',
    category: 'knitwear',
    garment: 'sweater',
    fabric: 'Merino wool',
    composition: '100% merino (fictional)',
    fit: 'Regular',
    care: 'Hand wash, dry flat (fictional)',
    colorFamily: 'Ivory',
    occasion: 'Everyday',
    price: 460000,
    status: 'published',
    colors: [
      { name: 'Ivory', hex: '#efe7d8' },
      { name: 'Deep Olive', hex: '#4d5340' },
      { name: 'Charcoal', hex: '#3a3a3c' },
    ],
    sizes: ['S', 'M', 'L', 'XL'],
    stockPattern: [0, 2, 1, 0],
    soldOutSizes: [0, 3],
    lowStockSizes: [1, 2],
    tags: ['sample', 'knitwear'],
  },
  {
    slug: 'supima-pocket-tee',
    title: 'Supima Pocket Tee',
    subtitle: 'Mid-weight jersey, ribbed collar',
    description: 'Sample record. Entry price point, three colours, deeper stock.',
    category: 't-shirts',
    garment: 't-shirt',
    fabric: 'Supima cotton',
    composition: '100% supima cotton (fictional)',
    fit: 'Standard',
    care: 'Machine wash warm (fictional)',
    colorFamily: 'Ivory',
    occasion: 'Everyday',
    price: 145000,
    compareAt: 180000,
    status: 'published',
    colors: [
      { name: 'White', hex: '#f6f4ef' },
      { name: 'Black', hex: '#1c1c1e' },
      { name: 'Moss', hex: '#5b6350' },
    ],
    sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    stockPattern: [22, 30, 34, 28, 18, 9],
    tags: ['sample', 'basic'],
  },
  {
    slug: 'poplin-weekend-shirt',
    title: 'Poplin Weekend Shirt',
    subtitle: 'Camp collar, boxy cut',
    description: 'Sample record held in draft, to prove unpublished products stay out of the storefront.',
    category: 'shirts',
    garment: 'shirt',
    fabric: 'Poplin',
    composition: '100% cotton (fictional)',
    fit: 'Relaxed',
    care: 'Machine wash cold (fictional)',
    colorFamily: 'Stripe',
    occasion: 'Weekend',
    price: 295000,
    status: 'draft',
    colors: [{ name: 'Ivory Stripe', hex: '#e8e2d4' }],
    sizes: ['S', 'M', 'L', 'XL'],
    stockPattern: [6, 10, 8, 4],
    tags: ['sample', 'draft'],
  },
  {
    slug: 'chino-in-cotton-twill',
    title: 'Cotton Twill Chino',
    subtitle: 'Flat front, tapered leg',
    description: 'Sample record demonstrating an archived product that must return not-found on the storefront.',
    category: 'trousers',
    garment: 'trouser',
    fabric: 'Cotton twill',
    composition: '98% cotton / 2% elastane (fictional)',
    fit: 'Tapered',
    care: 'Machine wash cold (fictional)',
    colorFamily: 'Navy',
    occasion: 'Everyday',
    price: 380000,
    status: 'archived',
    colors: [
      { name: 'Navy', hex: '#26324a' },
      { name: 'Sand', hex: '#c9b79a' },
    ],
    sizes: ['30', '32', '34', '36'],
    stockPattern: [0, 0, 0, 0],
    tags: ['sample', 'archive'],
  },
  {
    slug: 'merino-half-zip',
    title: 'Merino Half-Zip',
    subtitle: 'Self-fabric collar, two-way zip',
    description: 'Sample record with an out-of-stock product status to exercise the sold-out UI path.',
    category: 'knitwear',
    garment: 'sweater',
    fabric: 'Merino wool',
    composition: '100% merino (fictional)',
    fit: 'Regular',
    care: 'Hand wash (fictional)',
    colorFamily: 'Charcoal',
    occasion: 'Travel',
    price: 520000,
    status: 'out_of_stock',
    colors: [{ name: 'Charcoal', hex: '#3a3a3c' }],
    sizes: ['S', 'M', 'L', 'XL'],
    stockPattern: [0, 0, 0, 0],
    soldOutSizes: [0, 1, 2, 3],
    tags: ['sample', 'restock-candidate'],
  },
  {
    slug: 'linen-crop-trouser',
    title: 'Linen Crop Trouser',
    subtitle: 'Drawstring waist, cropped break',
    description: 'Sample record: warm-weather piece with one colour and a low stock ceiling.',
    category: 'trousers',
    garment: 'trouser',
    fabric: 'Linen',
    composition: '100% linen (fictional)',
    fit: 'Relaxed',
    care: 'Machine wash cold (fictional)',
    colorFamily: 'Ivory',
    occasion: 'Weekend',
    price: 340000,
    status: 'published',
    colors: [{ name: 'Chalk', hex: '#eae6dc' }],
    sizes: ['28', '30', '32', '34'],
    stockPattern: [2, 3, 2, 1],
    lowStockSizes: [3],
    tags: ['sample', 'warm-weather'],
  },
  {
    slug: 'double-breasted-waistcoat',
    title: 'Double-Breasted Waistcoat',
    subtitle: 'Four-in-hand back, notch lapel',
    description: 'Sample record for occasion wear in a higher price band.',
    category: 'blazers-jackets',
    garment: 'waistcoat',
    fabric: 'Wool blend',
    composition: '70% wool / 30% viscose (fictional)',
    fit: 'Slim',
    care: 'Dry clean (fictional)',
    colorFamily: 'Midnight',
    occasion: 'Occasion',
    price: 680000,
    status: 'published',
    colors: [
      { name: 'Midnight', hex: '#22252f' },
      { name: 'Camel', hex: '#b39063' },
    ],
    sizes: ['S', 'M', 'L', 'XL'],
    stockPattern: [2, 4, 3, 1],
    tags: ['sample', 'occasion'],
  },
  {
    slug: 'garment-dyed-capsule-tee',
    title: 'Garment-Dyed Capsule Tee',
    subtitle: 'Three-pack capsule, garment dyed',
    description: 'Sample record demonstrating a sold-out size inside an otherwise available product.',
    category: 'wardrobe-essentials',
    garment: 't-shirt',
    fabric: 'Combed cotton',
    composition: '100% cotton (fictional)',
    fit: 'Boxy',
    care: 'Machine wash cold (fictional)',
    colorFamily: 'Rinse',
    occasion: 'Everyday',
    price: 390000,
    status: 'published',
    colors: [{ name: 'Faded Indigo', hex: '#41506b' }],
    sizes: ['S', 'M', 'L', 'XL'],
    stockPattern: [6, 8, 5, 0],
    soldOutSizes: [3],
    tags: ['sample', 'capsule'],
  },
  {
    slug: 'finespun-cashmere-scarf',
    title: 'Finespun Cashmere Scarf',
    subtitle: 'One size, hand-rolled fringe',
    description: 'Sample record without size variants — proves the “one size” purchase path.',
    category: 'wardrobe-essentials',
    garment: 'accessory',
    fabric: 'Cashmere',
    composition: '100% cashmere (fictional)',
    fit: 'One size',
    care: 'Dry clean (fictional)',
    colorFamily: 'Stone',
    occasion: 'Winter',
    price: 720000,
    status: 'published',
    colors: [{ name: 'Oat', hex: '#d8cdb8' }],
    sizes: ['One size'],
    stockPattern: [7],
    tags: ['sample', 'accessory', 'gift'],
  },
];

const sizeGuideFor = (garment: string): string =>
  garment === 'trouser' ? 'bottoms-waist' : garment === 'accessory' ? 'one-size' : 'standard-tops';

let productCount = 0;
let variantCount = 0;

transaction(() => {
  for (const c of CATEGORIES) {
    const existing = get<{ id: number }>('SELECT id FROM categories WHERE slug = ?', [c.slug]);
    if (existing) {
      updateRow('categories', 'id', existing.id, {
        name: c.name,
        description: c.description,
        sort_order: c.sort,
        updated_at: now,
      });
      continue;
    }
    insertRow('categories', {
      slug: c.slug,
      name: c.name,
      description: c.description,
      sort_order: c.sort,
      meta_title: `${c.name} — K-brands`,
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
    const fields = {
      slug: p.slug,
      title: p.title,
      subtitle: p.subtitle,
      description: p.description,
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
      updateRow('products', 'id', existing.id, {
        ...fields,
        updated_at: now,
        published_at: ['published', 'out_of_stock'].includes(p.status) ? (existing ? now : now) : null,
      });
      productId = existing.id;
    } else {
      productId = insertRow('products', {
        ...fields,
        published_at: ['published', 'out_of_stock'].includes(p.status) ? now : null,
        created_at: now,
        updated_at: now,
      }).lastInsertRowid;
    }
    productCount += 1;

    run('DELETE FROM product_images WHERE product_id = ?', [productId]);
    for (let i = 0; i < 3; i += 1) {
      insertRow('product_images', {
        product_id: productId,
        url: `/media/sample/${p.slug}/${String(i)}.svg`,
        alt: `${p.title} — sample visual ${String(i + 1)} (illustration, not product photography)`,
        position: i,
        kind: 'generated',
        width: 900,
        height: 1200,
      });
    }
    run('DELETE FROM product_tags WHERE product_id = ?', [productId]);
    for (const t of p.tags) run('INSERT OR IGNORE INTO product_tags (product_id, tag) VALUES (?, ?)', [productId, t]);

    // Clear any cart lines / reservations that point at the old variant ids
    // before recreating them, so a re-seed never breaks foreign keys.
    run(
      `DELETE FROM cart_lines WHERE variant_id IN (SELECT id FROM variants WHERE product_id = ?)`,
      [productId],
    );
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
        const vres = insertRow('variants', {
          product_id: productId,
          sku,
          size,
          color_name: color.name,
          color_code: color.hex,
          price_cents: null,
          compare_at_price_cents: p.compareAt ?? null,
          stock_qty: qty,
          reserved_qty: 0,
          status: 'active',
          weight_grams: 420,
          created_at: now,
          updated_at: now,
        });
        variantCount += 1;
        insertRow('inventory_ledger', {
          variant_id: vres.lastInsertRowid,
          change_qty: qty,
          reason: 'sample_seed',
          balance_after: qty,
          ref_type: 'seed',
          ref_id: 'seed-demo',
          note: 'Fictional sample stock — not real inventory',
          created_at: now,
        });
      }
    }
  });
}

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
    url: `/media/sample/${slug}/0.svg`,
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
