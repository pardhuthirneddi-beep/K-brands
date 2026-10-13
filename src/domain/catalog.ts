import { all, get, run, transaction } from '../db/client.ts';
import * as env from '../lib/env.ts';
import { AppError } from '../lib/errors.ts';
import { discountPercent } from './money.ts';

/**
 * Catalogue reads and writes.
 *
 * SAMPLE-DATA ISOLATION (acceptance criteria): `is_sample = 1` marks every
 * development-only record. Storefront and API reads always pass through
 * `catalogVisibilityClause()`, which drops sample rows whenever the demo
 * catalogue switch is off (production default). Admin writes refuse to
 * *publish* a sample product into a live catalogue. See docs/sample-data.md.
 */

export type ProductRow = {
  id: number;
  slug: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  category_id: number | null;
  category_slug: string | null;
  category_name: string | null;
  brand_line: string | null;
  garment_type: string | null;
  fit: string | null;
  fabric: string | null;
  fabric_composition: string | null;
  care: string | null;
  color_family: string | null;
  occasion: string | null;
  price_cents: number;
  compare_at_price_cents: number | null;
  currency: string;
  tax_bps: number;
  status: 'draft' | 'published' | 'archived' | 'out_of_stock';
  is_sample: number;
  sample_note: string | null;
  size_guide_key: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type VariantRow = {
  id: number;
  product_id: number;
  sku: string;
  size: string | null;
  color_name: string | null;
  color_code: string | null;
  material_variant: string | null;
  price_cents: number | null;
  compare_at_price_cents: number | null;
  stock_qty: number;
  reserved_qty: number;
  status: 'active' | 'inactive';
  weight_grams: number | null;
};

export type ImageRow = { id: number; url: string; alt: string; kind: string; position: number };

const BASE_SELECT = `
  SELECT p.*, c.slug AS category_slug, c.name AS category_name,
         (SELECT i.url FROM product_images i WHERE i.product_id = p.id ORDER BY i.position, i.id LIMIT 1) AS primary_image,
         (SELECT COALESCE(SUM(CASE WHEN v.status='active' THEN v.stock_qty - v.reserved_qty ELSE 0 END),0)
          FROM variants v WHERE v.product_id = p.id) AS available_units,
         (SELECT COUNT(*) FROM variants v WHERE v.product_id = p.id) AS variant_count
  FROM products p LEFT JOIN categories c ON c.id = p.category_id`;

/** Where-clause fragment enforcing status + sample isolation. */
export function catalogVisibilityClause(opts: { includeSamples?: boolean; admin?: boolean } = {}) {
  const parts: string[] = [];
  const params: (string | number)[] = [];
  if (!opts.admin) {
    parts.push("p.status IN ('published','out_of_stock')");
    const samplesAllowed = opts.includeSamples ?? env.demoCatalogueEnabled;
    if (!samplesAllowed) parts.push('p.is_sample = 0');
  }
  return { where: parts.length ? `WHERE ${parts.join(' AND ')}` : '', params };
}

function mapProduct(row: ProductRow & Record<string, unknown>): CatalogProduct {
  return {
    ...(row as unknown as ProductRow),
    isSample: row.is_sample === 1,
    priceCents: row.price_cents,
    savingsPercent: discountPercent(row.price_cents, row.compare_at_price_cents),
    primaryImage: (row.primary_image as string | null) ?? null,
    availableUnits: Number(row.available_units ?? 0),
    variantCount: Number(row.variant_count ?? 0),
  };
}

export type CatalogProduct = ProductRow & {
  isSample: boolean;
  priceCents: number;
  savingsPercent: number | null;
  primaryImage: string | null;
  availableUnits: number;
  variantCount: number;
};

export type ProductWithDetails = CatalogProduct & {
  images: ImageRow[];
  variants: (VariantRow & { available: number; sellPriceCents: number; compareAt: number | null })[];
  sizes: string[];
  colors: { name: string; hex: string | null; inStock: boolean }[];
  tags: string[];
  totalAvailable: number;
  soldOut: boolean;
};

export function listProducts(opts: {
  categorySlug?: string | null;
  search?: string | null;
  sort?: SortKey;
  page?: number;
  perPage?: number;
  includeSamples?: boolean;
  admin?: boolean;
  sizes?: string[];
  colors?: string[];
  maxPriceCents?: number | null;
  onlyInStock?: boolean;
  garmentTypes?: string[];
} = {}): { items: CatalogProduct[]; total: number; page: number; pages: number; perPage: number; sampleInView: number } {
  const { where, params } = catalogVisibilityClause(opts);
  const clauses: string[] = where ? [where.replace(/^WHERE /, '')] : [];
  const args: (string | number)[] = [...params];

  if (opts.categorySlug) {
    clauses.push('(c.slug = ? OR c.parent_id = (SELECT id FROM categories WHERE slug = ?))');
    args.push(opts.categorySlug, opts.categorySlug);
  }
  if (opts.search?.trim()) {
    const like = `%${opts.search.trim().toLowerCase().slice(0, 60)}%`;
    clauses.push(
      `(LOWER(p.title) LIKE ? OR LOWER(COALESCE(p.subtitle,'')) LIKE ? OR LOWER(COALESCE(p.description,'')) LIKE ?
        OR LOWER(COALESCE(p.fabric,'')) LIKE ? OR LOWER(COALESCE(p.garment_type,'')) LIKE ?
        OR LOWER(COALESCE(p.color_family,'')) LIKE ? OR LOWER(COALESCE(c.name,'')) LIKE ?
        OR EXISTS (SELECT 1 FROM product_tags t WHERE t.product_id = p.id AND LOWER(t.tag) LIKE ?))`,
    );
    for (let i = 0; i < 8; i += 1) args.push(like);
  }
  if (opts.maxPriceCents && opts.maxPriceCents > 0) {
    clauses.push('p.price_cents <= ?');
    args.push(opts.maxPriceCents);
  }
  if (opts.onlyInStock) {
    clauses.push(
      'EXISTS (SELECT 1 FROM variants v WHERE v.product_id = p.id AND v.status = \'active\' AND v.stock_qty > v.reserved_qty)',
    );
  }
  if (opts.sizes?.length) {
    clauses.push(`EXISTS (SELECT 1 FROM variants v WHERE v.product_id = p.id AND v.size IN (${opts.sizes.map(() => '?').join(',')}))`);
    args.push(...opts.sizes);
  }
  if (opts.colors?.length) {
    clauses.push(`EXISTS (SELECT 1 FROM variants v WHERE v.product_id = p.id AND LOWER(COALESCE(v.color_name,'')) IN (${opts.colors.map(() => '?').join(',')}))`);
    args.push(...opts.colors.map((c) => c.toLowerCase()));
  }
  if (opts.garmentTypes?.length) {
    clauses.push(`LOWER(COALESCE(p.garment_type,'')) IN (${opts.garmentTypes.map(() => '?').join(',')})`);
    args.push(...opts.garmentTypes.map((g) => g.toLowerCase()));
  }

  const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const total = get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM products p LEFT JOIN categories c ON c.id = p.category_id ${whereSql}`,
    args,
  )?.n ?? 0;

  const sort = opts.sort ?? 'newest';
  const orderBy = SORT_SQL[sort] ?? SORT_SQL.newest;
  const perPage = Math.min(Math.max(opts.perPage ?? 12, 1), 60);
  const page = Math.max(1, opts.page ?? 1);
  const offset = (page - 1) * perPage;

  const rows = all<ProductRow & Record<string, unknown>>(
    `${BASE_SELECT} ${whereSql} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
    [...args, perPage, offset],
  );
  const items = rows.map(mapProduct);
  return {
    items,
    total,
    page,
    pages: Math.max(1, Math.ceil(total / perPage)),
    perPage,
    /** How many records in the *current page* are development samples. */
    sampleInView: items.filter((i) => i.isSample).length,
  };
}

export type SortKey = 'newest' | 'price_asc' | 'price_desc' | 'name_asc' | 'discount' | 'featured';

export const SORT_LABELS: Record<SortKey, string> = {
  featured: 'Featured',
  newest: 'Newest',
  price_asc: 'Price: low to high',
  price_desc: 'Price: high to low',
  name_asc: 'Alphabetical',
  discount: 'Biggest saving',
};

const SORT_SQL: Record<SortKey, string> = {
  newest: 'COALESCE(p.published_at, p.created_at) DESC, p.id DESC',
  price_asc: 'p.price_cents ASC, p.id ASC',
  price_desc: 'p.price_cents DESC, p.id DESC',
  name_asc: 'p.title ASC',
  discount: "CASE WHEN p.compare_at_price_cents > p.price_cents THEN (p.compare_at_price_cents - p.price_cents) * 1.0 / p.compare_at_price_cents ELSE 0 END DESC, p.id DESC",
  featured: 'CASE WHEN p.compare_at_price_cents > p.price_cents THEN 1 ELSE 0 END DESC, COALESCE(p.published_at, p.created_at) DESC, p.id DESC',
};

export function getProductBySlug(
  slug: string,
  opts: { admin?: boolean; includeSamples?: boolean } = {},
): ProductWithDetails | null {
  const row = get<ProductRow & Record<string, unknown>>(`${BASE_SELECT} WHERE p.slug = ?`, [slug]);
  if (!row) return null;
  if (!opts.admin) {
    if (!['published', 'out_of_stock'].includes(row.status)) return null;
    if (!(opts.includeSamples ?? env.demoCatalogueEnabled) && row.is_sample === 1) return null;
  }
  const images = all<ImageRow>(
    'SELECT id, url, alt, kind, position FROM product_images WHERE product_id = ? ORDER BY position, id',
    [row.id],
  );
  const variants = all<VariantRow>(
    'SELECT * FROM variants WHERE product_id = ? ORDER BY COALESCE(size, \'\'), COALESCE(color_name, \'\')',
    [row.id],
  );
  const decorated = variants.map((v) => ({
    ...v,
    available: Math.max(0, v.stock_qty - v.reserved_qty),
    sellPriceCents: v.price_cents ?? row.price_cents,
    compareAt: v.compare_at_price_cents ?? row.compare_at_price_cents,
  }));
  const sizes = Array.from(
    new Set(decorated.filter((v) => v.size && v.status === 'active').map((v) => v.size as string)),
  );
  const colorMap = new Map<string, { name: string; hex: string | null; inStock: boolean }>();
  for (const v of decorated) {
    if (!v.color_name || v.status !== 'active') continue;
    const key = v.color_name.toLowerCase();
    const prev = colorMap.get(key);
    colorMap.set(key, {
      name: v.color_name,
      hex: v.color_code ?? prev?.hex ?? null,
      inStock: Boolean(prev?.inStock) || v.stock_qty - v.reserved_qty > 0,
    });
  }
  const tags = all<{ tag: string }>('SELECT tag FROM product_tags WHERE product_id = ? ORDER BY tag', [row.id]).map(
    (t) => t.tag,
  );
  return {
    ...mapProduct(row),
    images,
    variants: decorated,
    sizes,
    colors: [...colorMap.values()],
    tags,
    totalAvailable: decorated.reduce((s, v) => s + (v.status === 'active' ? v.available : 0), 0),
    soldOut: decorated.every((v) => v.available <= 0 || v.status !== 'active'),
  };
}

export function variantWithProduct(variantId: number) {
  return get<
    {
      variant_id: number;
      product_id: number;
      slug: string;
      title: string;
      status: string;
      is_sample: number;
      sku: string;
      size: string | null;
      color_name: string | null;
      price_cents: number;
      compare_at_price_cents: number | null;
      tax_bps: number;
      currency: string;
      stock_qty: number;
      reserved_qty: number;
      variant_status: string;
      image_url: string | null;
      weight_grams: number | null;
    }
  >(
    `SELECT v.id AS variant_id, p.id AS product_id, p.slug, p.title, p.status, p.is_sample, v.sku, v.size,
            v.color_name,
            COALESCE(v.price_cents, p.price_cents) AS price_cents,
            COALESCE(v.compare_at_price_cents, p.compare_at_price_cents) AS compare_at_price_cents,
            p.tax_bps, p.currency, v.stock_qty, v.reserved_qty, v.status AS variant_status,
            (SELECT url FROM product_images i WHERE i.product_id = p.id ORDER BY i.position, i.id LIMIT 1) AS image_url,
            v.weight_grams
     FROM variants v JOIN products p ON p.id = v.product_id
     WHERE v.id = ?`,
    [variantId],
  );
}

/* ------------------------------------------------------------- faceting */

export function facetCounts(opts: { categorySlug?: string | null; includeSamples?: boolean } = {}) {
  // NOTE: the visibility clause has to come *after* the joins — SQL takes one WHERE per
  // query, and splicing it in front of a JOIN is a syntax error. The helpers below build
  // `joins` and `conditions` separately for exactly that reason.
  const { where, params } = catalogVisibilityClause(opts);
  const base: string[] = where ? [where.replace(/^WHERE /, '')] : [];
  if (opts.categorySlug) {
    base.push('c.slug = ?');
    params.push(opts.categorySlug);
  }
  const fromBase = 'FROM products p LEFT JOIN categories c ON c.id = p.category_id';
  const joinVariants = 'JOIN variants v ON v.product_id = p.id AND v.status = \'active\'';

  const sizes = all<{ size: string; n: number }>(
    `SELECT v.size AS size, COUNT(DISTINCT p.id) AS n ${fromBase} ${joinVariants}
     WHERE ${[...base, "v.size IS NOT NULL"].join(' AND ')}
     GROUP BY v.size ORDER BY n DESC`,
    params,
  );
  const colors = all<{ color: string; hex: string | null; n: number }>(
    `SELECT v.color_name AS color, MIN(v.color_code) AS hex, COUNT(DISTINCT p.id) AS n ${fromBase} ${joinVariants}
     WHERE ${[...base, "v.color_name IS NOT NULL"].join(' AND ')}
     GROUP BY v.color_name ORDER BY n DESC`,
    params,
  );
  const garments = all<{ garment: string; n: number }>(
    `SELECT LOWER(p.garment_type) AS garment, COUNT(*) AS n ${fromBase}
     WHERE ${[...base, 'p.garment_type IS NOT NULL'].join(' AND ')}
     GROUP BY LOWER(p.garment_type) ORDER BY n DESC`,
    params,
  );
  const price = get<{ min: number | null; max: number | null }>(
    `SELECT MIN(p.price_cents) AS min, MAX(p.price_cents) AS max ${fromBase}
     WHERE ${base.length > 0 ? base.join(' AND ') : '1 = 1'}`,
    params,
  );
  return { sizes, colors, garments, priceMinCents: price?.min ?? 0, priceMaxCents: price?.max ?? 0 };
}

export function listCategories(opts: { includeSamples?: boolean } = {}) {
  // Products are counted through a correlated subquery, so the storefront visibility rule
  // (published, and no samples unless allowed) belongs *inside* it — the outer row is a
  // category, and `p.status` there would not resolve.
  const samplesAllowed = opts.includeSamples ?? env.demoCatalogueEnabled;
  const productFilter = samplesAllowed ? "AND p.status IN ('published','out_of_stock')" : "AND p.status IN ('published','out_of_stock') AND p.is_sample = 0";
  return all<{
    slug: string;
    name: string;
    description: string | null;
    parent_slug: string | null;
    product_count: number;
  }>(
    `SELECT c.slug, c.name, c.description, pc.slug AS parent_slug,
            (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id ${productFilter}) AS product_count
     FROM categories c LEFT JOIN categories pc ON pc.id = c.parent_id
     ORDER BY COALESCE(c.sort_order, 99), c.name`,
    [],
  );
}

export function collectionPage(slug: string) {
  const cat = get<{ slug: string; name: string; description: string | null; meta_title: string | null; meta_description: string | null }>(
    'SELECT slug, name, description, meta_title, meta_description FROM categories WHERE slug = ?',
    [slug],
  );
  return cat ?? null;
}

/* ------------------------------------------------------- admin catalogue */

export function upsertProduct(
  input: Partial<ProductRow> & {
    slug: string;
    title: string;
    price_cents: number;
    tags?: string[];
    images?: { url: string; alt: string; kind?: 'photo' | 'placeholder' | 'generated' }[];
    actorUserId?: number;
  },
  opts: { isProduction?: boolean } = {},
): { id: number } {
  const ts = new Date().toISOString();
  const isProduction = opts.isProduction ?? env.isProduction;
  const isSample = input.is_sample === undefined ? 1 : input.is_sample;
  // Production safeguard: a sample record may never be published into a live catalogue.
  if (isProduction && isSample === 1 && input.status === 'published') {
    throw new AppError(
      'policy_not_configured',
      'Sample catalogue records cannot be published while the live store is enabled. Convert the record to verified product data first.',
      503,
    );
  }
  if (input.price_cents < 0) throw new AppError('validation_error', 'Price must be zero or greater.', 400);

  return transaction(() => {
    const existing = get<{ id: number }>('SELECT id FROM products WHERE slug = ?', [input.slug]);
    let id: number;
    if (existing) {
      id = existing.id;
      run(
        `UPDATE products SET title = ?, subtitle = ?, description = ?, price_cents = ?, compare_at_price_cents = ?,
                status = ?, is_sample = ?, sample_note = ?, fabric = ?, fabric_composition = ?, fit = ?, care = ?,
                garment_type = ?, color_family = ?, occasion = ?, brand_line = ?, tax_bps = ?, size_guide_key = ?,
                category_id = (SELECT id FROM categories WHERE slug = ?), updated_at = ?,
                published_at = CASE WHEN ? = 'published' AND published_at IS NULL THEN ? ELSE published_at END
         WHERE id = ?`,
        [
          input.title,
          input.subtitle ?? null,
          input.description ?? null,
          input.price_cents,
          input.compare_at_price_cents ?? null,
          input.status ?? 'draft',
          isSample,
          input.sample_note ?? (isSample === 1 ? 'Development sample — not real inventory.' : null),
          input.fabric ?? null,
          input.fabric_composition ?? null,
          input.fit ?? null,
          input.care ?? null,
          input.garment_type ?? null,
          input.color_family ?? null,
          input.occasion ?? null,
          input.brand_line ?? null,
          input.tax_bps ?? 0,
          input.size_guide_key ?? 'standard-tops',
          input.category_slug ?? null,
          ts,
          input.status ?? 'draft',
          ts,
          id,
        ],
      );
      if (input.tags) {
        run('DELETE FROM product_tags WHERE product_id = ?', [id]);
        for (const t of input.tags) run('INSERT OR IGNORE INTO product_tags (product_id, tag) VALUES (?, ?)', [id, t]);
      }
    } else {
      const res = run(
        `INSERT INTO products (slug, title, subtitle, description, category_id, brand_line, garment_type, fit, fabric,
              fabric_composition, care, gender, color_family, occasion, price_cents, compare_at_price_cents, currency,
              tax_bps, status, is_sample, sample_note, size_guide_key, published_at, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          input.slug,
          input.title,
          input.subtitle ?? null,
          input.description ?? null,
          get<{ id: number }>('SELECT id FROM categories WHERE slug = ?', [input.category_slug ?? ''])?.id ?? null,
          input.brand_line ?? null,
          input.garment_type ?? null,
          input.fit ?? null,
          input.fabric ?? null,
          input.fabric_composition ?? null,
          input.care ?? null,
          'men',
          input.color_family ?? null,
          input.occasion ?? null,
          input.price_cents,
          input.compare_at_price_cents ?? null,
          input.currency ?? 'INR',
          input.tax_bps ?? 0,
          input.status ?? 'draft',
          isSample,
          input.sample_note ?? (isSample === 1 ? 'Development sample — not real inventory.' : null),
          input.size_guide_key ?? 'standard-tops',
          input.status === 'published' ? ts : null,
          ts,
          ts,
        ],
      );
      id = res.lastInsertRowid;
      for (const t of input.tags ?? []) run('INSERT OR IGNORE INTO product_tags (product_id, tag) VALUES (?, ?)', [id, t]);
    }
    if (input.images) {
      run('DELETE FROM product_images WHERE product_id = ?', [id]);
      input.images.forEach((img, i) => {
        run(
          'INSERT INTO product_images (product_id, url, alt, position, kind) VALUES (?, ?, ?, ?, ?)',
          [id, img.url, img.alt || `${input.title} product image ${String(i + 1)}`, i, img.kind ?? 'placeholder'],
        );
      });
    }
    return { id };
  });
}

export function upsertVariant(input: {
  productSlug: string;
  sku: string;
  size?: string | null;
  colorName?: string | null;
  colorCode?: string | null;
  priceCents?: number | null;
  compareAtCents?: number | null;
  stockQty?: number;
  status?: 'active' | 'inactive';
  weightGrams?: number | null;
}): { id: number } {
  const ts = new Date().toISOString();
  const product = get<{ id: number; is_sample: number }>('SELECT id, is_sample FROM products WHERE slug = ?', [
    input.productSlug,
  ]);
  if (!product) throw new AppError('not_found', 'Unknown product.', 404);
  return transaction(() => {
    const existing = get<{ id: number; stock_qty: number; reserved_qty: number }>(
      'SELECT id, stock_qty, reserved_qty FROM variants WHERE sku = ?',
      [input.sku],
    );
    const stock = Math.max(0, input.stockQty ?? 0);
    if (existing) {
      if (stock < existing.reserved_qty) {
        throw new AppError('conflict', `Cannot set stock below the ${String(existing.reserved_qty)} unit(s) on hold.`, 409);
      }
      run(
        `UPDATE variants SET size = ?, color_name = ?, color_code = ?, price_cents = ?, compare_at_price_cents = ?,
         stock_qty = ?, status = ?, weight_grams = ?, updated_at = ?,
         material_variant = COALESCE(material_variant, NULL) WHERE id = ?`,
        [
          input.size ?? null,
          input.colorName ?? null,
          input.colorCode ?? null,
          input.priceCents ?? null,
          input.compareAtCents ?? null,
          stock,
          input.status ?? 'active',
          input.weightGrams ?? null,
          ts,
          existing.id,
        ],
      );
      const delta = stock - existing.stock_qty;
      if (delta !== 0) {
        run(
          `INSERT INTO inventory_ledger (variant_id, change_qty, reason, balance_after, ref_type, ref_id, note, created_at)
           VALUES (?, ?, 'correction', ?, 'admin', 'upsert', 'stock set by catalogue edit', ?)`,
          [existing.id, delta, stock, ts],
        );
      }
      return { id: existing.id };
    }
    const res = run(
      `INSERT INTO variants (product_id, sku, size, color_name, color_code, price_cents, compare_at_price_cents,
        stock_qty, reserved_qty, status, weight_grams, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,0,?,?,?,?)`,
      [
        product.id,
        input.sku,
        input.size ?? null,
        input.colorName ?? null,
        input.colorCode ?? null,
        input.priceCents ?? null,
        input.compareAtCents ?? null,
        stock,
        input.status ?? 'active',
        input.weightGrams ?? null,
        ts,
        ts,
      ],
    );
    run(
      `INSERT INTO inventory_ledger (variant_id, change_qty, reason, balance_after, ref_type, ref_id, note, created_at)
       VALUES (?, ?, ?, ?, 'admin', 'create', 'initial stock', ?)`,
      [res.lastInsertRowid, stock, product.is_sample === 1 ? 'sample_seed' : 'purchase', stock, ts],
    );
    return { id: res.lastInsertRowid };
  });
}

export function productCount(): { total: number; sample: number; real: number; published: number } {
  const row = get<{ total: number; sample: number; published: number }>(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN is_sample = 1 THEN 1 ELSE 0 END) AS sample,
            SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) AS published
     FROM products`,
  );
  const total = row?.total ?? 0;
  const sample = row?.sample ?? 0;
  return { total, sample, real: total - sample, published: row?.published ?? 0 };
}
