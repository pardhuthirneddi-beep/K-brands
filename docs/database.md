# Database

## Engine and driver

One file: `.data/kbrands.sqlite3`, driven by Node's built-in **`node:sqlite`**
(`DatabaseSync`). It is still marked experimental in the Node releases this project targets, which is
why every run prints `ExperimentalWarning: SQLite is an experimental feature` — that warning is
expected here, not a fault. There is no ORM and no native driver to build.

Path resolution, in order (`src/db/client.ts`):

1. `KBRANDS_DB_PATH` if set;
2. `<cwd>/.data/kbrands.sqlite3`;
3. `KBRANDS_TEST_DB_PATH` is the fallback used by the integration tests.

Per-connection pragmas: `journal_mode = WAL`, `synchronous = NORMAL`, `foreign_keys = ON`,
`busy_timeout = 8000`, `wal_autocheckpoint = 500`. A single connection is reused process-wide
(`getDb()` memoises it), which is the correct shape for SQLite and the reason writes are serialised
through `transaction()`.

## Migrations

`src/db/migrate.ts` holds the whole schema as an ordered list of statements (32 `CREATE TABLE`s:
users, sessions, auth tokens, addresses, catalogue, variants, images, carts, reservations, orders,
order lines/events, payments, refunds, returns, shipments, coupons, notifications, settings, audit
logs). `ensureDb()` in `src/lib/bootstrap.ts` applies what is missing on boot and is a no-op
afterwards, so a restart never rewrites anything.

Rules this schema is written to:

* **Money is an integer count of paise** (`price_cents`, `total_cents`, …) with a `currency` code
  beside it. `CHECK (price_cents >= 0)` and
  `CHECK (compare_at_price_cents IS NULL OR compare_at_price_cents >= price_cents)` mean a bad price
  is rejected by the database, not just by the form.
* Tax is `tax_bps INTEGER CHECK (tax_bps BETWEEN 0 AND 10000)` — basis points, so 5% is `500`, and
  there is no float rounding anywhere in a total.
* `role` and `status` are CHECK-constrained enumerations, so an out-of-range value cannot be inserted
  by a bug in a caller.
* `variants` carries `CHECK (reserved_qty <= stock_qty)`; overselling is additionally prevented by a
  conditional update inside `BEGIN IMMEDIATE` (see `docs/security.md`).
* `orders.idempotency_key` is the anti-duplicate-order mechanism; `SKUs` are `UNIQUE`.
* Sample data is flaggable *in the row*: `products.is_sample`, `products.sample_note`,
  `orders.is_sample_order`. That is what lets the demo survive into a production build without
  pretending to be real (`docs/sample-data.md`).

## What may not be done to this database

* No destructive migration. Adding a column with a default is fine; dropping or recreating a table
  that holds `orders`, `order_lines` or `users` is not, and none is written.
* Products referenced by `order_lines` are archived (`status = 'archived'`) rather than deleted by
  the catalogue tooling, even though the schema would survive a deletion — see the snapshot columns
  above. The seam is deliberate: the database tolerates the delete, the storefront still reads better
  with the row present but archived. `order_lines.is_sample` additionally marks which lines in a
  receipt were demo records, so a mixed order cannot be mistaken for an all-real one.
* Deleting a product or a variant does not damage history: `order_lines.product_id` and
  `order_lines.variant_id` are `ON DELETE SET NULL`, and the line keeps its own copy of everything it
  was sold as — `snapshot_title`, `snapshot_slug`, `snapshot_sku`, `snapshot_size`, `snapshot_color`,
  `snapshot_image_url`, `unit_price_cents`, `line_tax_cents`, `line_total_cents` — which is what the
  order page renders, so a later price or catalogue change cannot rewrite an old receipt. `order_lines` cascades from `orders` because an orphan line means
  nothing. `product_images` and `variants` cascade from the product for the same reason.
* Coupon usage is counted, not destroyed: `coupons.used_count` is incremented on redemption, and
  switching a coupon off is an explicit admin action (`active = 0`) rather than a side effect of an
  order, so a report of what a customer actually got can still be reconstructed.

## Local reset — the only supported way to throw data away

```
npm run db:reset -- --yes
```

`scripts/db-reset.ts` refuses to run when `NODE_ENV=production`, refuses any target outside
`./.data`, and **moves** `kbrands.sqlite3` plus `-wal`/`-shm` into `.data/backups/` instead of
deleting them. Without `--yes` it exits 1 explaining itself. A database holding real orders should
never be reset this way; restore from the backup directory if it was done by mistake.

## Backups and the demo boundary

Nothing in the app deletes customer rows. The seeder writes only rows it owns
(`is_sample = 1` with its own slug list) and prunes only those — see `docs/sample-data.md`.
