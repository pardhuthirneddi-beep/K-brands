# Sample (demo) catalogue

Everything the preview storefront shows today is **sample data**, and the codebase is built so that
this stays obvious in the interface and is enforced in the database.

## The mechanism

| Layer | What it does |
| --- | --- |
| `scripts/seed-demo.ts` | The single source of the demo catalogue: 12 categories, 13 men's products, 220 variants. Run it explicitly (`npm run db:seed-demo`); nothing seeds on boot, and nothing overwrites a non-sample row. |
| `products.is_sample` / `products.sample_note` | Every seeded product row carries `is_sample = 1` and a written note. Orders created while the demo catalogue is on carry `orders.is_sample_order = 1`. |
| `SampleBadge` (`src/components/ui/badge.tsx`) | Renders "Demo" on any sample product in the storefront grid, and "Sample data" in admin. It is driven by the row, not by an env flag, so **the label cannot disappear in production while the row is still fake**. |
| `src/domain/catalog.ts` | Refuses to publish a sample product into a live catalogue when `isProduction && !KBRANDS_DEMO_CATALOGUE`. |
| `scripts/guard-production-data.ts` (`npm run audit:guard`) | Reads the database and reports how many products are demo-flagged and how many are published as verified owner data; also fails on out-of-scope merchandise (`garment_type`, gender, categories outside the approved tree). |

`KBRANDS_DEMO_CATALOGUE` defaults to *on outside production, off inside it* (see
`src/lib/env.ts`). With the flag off and only sample rows present, the storefront is empty — that
is the intended production-safe behaviour, not a bug.

## What the demo data is not

* not real inventory — stock numbers are invented and marked as such;
* not verified photography — see `docs/product-imagery.md`;
* **no reviews, ratings or sales counts exist at all.** Nothing in the UI claims a star rating, a
  review count, "1,243 bought this week" or a bestseller rank, because none of it would be true.
* policies under `/policies/*` are labelled **draft** in the footer and in `sitemap.xml`, because
  the store owner has not approved them.

## Replacing it with real data — without rebuilding the frontend

The storefront reads `products`, `product_images`, `variants` and `categories`; it contains no
product names, prices or slugs of its own.

1. Add the real product through admin (`/admin/products`) or by inserting rows. Leave
   `is_sample = 0` and set a real `brand`, `garment_type`, prices in **paise** and stock.
2. Put a photograph of that exact garment at `public/media/<slug>.jpg` (plus
   `public/media/<slug>-<colourtoken>.jpg` per colourway) and insert a `product_images` row with
   `kind = 'photo'`. See `docs/product-imagery.md` for the naming contract.
3. Do nothing to components. `ProductCard`, the gallery, variant pickers and the collection grids
   pick the record up. The demo badge disappears on its own because it is driven by `is_sample`.
4. The seed prunes only rows it owns: `is_sample = 1` rows matching its own slug list. Real
   products are never deleted or renamed by it, and products referenced by `order_lines` are
   archived (`status = 'archived'`) rather than deleted, so historical orders keep their lines.

## Orders, payments and stock in demo mode

* `KBRANDS_PAYMENT_PROVIDER=mock_sandbox` records a test payment. Orders confirmed through it are
  labelled as mock on both the customer order page and the admin order page.
* `KBRANDS_SANDBOX_ORDERS=0` refuses order creation entirely, even sandbox ones.
* Cash-on-delivery (`KBRANDS_COD_ENABLED`) and international shipping (`KBRANDS_INTL_ENABLED`)
  default to off, and stay off until the owner confirms they are actually supported.
* Local admin sign-in for the preview uses `KBRANDS_BOOTSTRAP_ADMIN_EMAIL` /
  `..._PASSWORD` (minimum 14 characters). There is no default password, no public route and no
  form field that can grant the admin role — see `docs/security.md`.

## Resetting local data

`npm run db:reset -- --yes` moves `kbrands.sqlite3` (plus `-wal`/`-shm`) into
`.data/backups/` instead of deleting it, refuses to run in production, and refuses any target
outside `./.data`. Never run a delete-and-recreate against a database holding real orders.
