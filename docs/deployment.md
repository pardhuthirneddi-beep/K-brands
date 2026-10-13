# Deployment

No container or platform config is committed here: no Dockerfile, no `output: 'standalone'`, no IaC.
That is deliberate — the deploy target is the owner's decision, and guessing it would have produced a
file nobody verified. What follows is what this build actually requires.

## Shape of the app

A standard Next.js 15 App Router server (React 19, TypeScript, `next start`). Everything runs in one
Node process: pages, API routes, the SQLite file and the rate limiter. There is no separate backend,
queue or worker to provision — `node:sqlite` is used from the Node runtime, and `KBRANDS_EMAIL_MODE`
defaults to not sending anything.

```
npm ci
npm run typecheck && npm test && npm run build     # build also runs next lint
npm start                                          # next start -p 3000 -H 0.0.0.0
```

`npm start` binds `0.0.0.0:3000` here because the preview is proxied; behind a platform load balancer
that is normally what you want anyway, with TLS terminated upstream (`upgrade-insecure-requests` and
`Secure` cookies then depend on `NODE_ENV=production` and a correct `KBRANDS_SITE_URL`).

## Required before the first request

| Variable | Why it blocks |
| --- | --- |
| `NODE_ENV=production` | secure cookies, `Secure` session flag, `upgrade-insecure-requests`, sample-publish gate, `db:reset` refusal |
| `KBRANDS_APP_SECRET` | `requireServerCryptoSecret()` throws in production without it |
| `KBRANDS_SITE_URL` | canonicals, sitemap, OG/JSON-LD URLs |

Everything else is opt-in and defaults to the safe side; see `docs/environment.md`.

## Data

* The database is a file. It must live on a **writable, backed-up, non-ephemeral** volume — an
  instance that recreates its disk loses orders. `.data/` is git-ignored.
* Migrations apply automatically at boot through `ensureDb()` and are no-ops once applied
  (`docs/database.md`). Nothing destructive is in that list, and there is no `db:push`-style reset
  wired into any deploy step.
* A fresh production database contains **no products at all** — by design. It must not be seeded with
  the demo catalogue: `scripts/seed-demo.ts` refuses unless `KBRANDS_ALLOW_SAMPLE_SEED=1` is set
  explicitly, and `src/domain/catalog.ts` separately refuses to publish sample rows when
  `KBRANDS_DEMO_CATALOGUE` is off. If the storefront looks empty after a deploy, that is the guard
  working; load verified data.
* Backups: SQLite in WAL mode, so copy `kbrands.sqlite3`, `-wal` and `-shm` together (or run
  `VACUUM INTO`). Restoring a main file without its `-wal` loses the most recent transactions.

## Caching, and what is not cached

* `/api/*` responses send `Cache-Control: no-store, max-age=0`, so a cart, checkout or admin call is
  never served from a shared cache.
* Security headers are applied in `next.config.ts` so static assets and error pages carry them too.
* `next/image` output is cached for `minimumCacheTTL: 3600` seconds and served in AVIF/WebP.
* **Pages are dynamic, not ISR.** 65 route files declare `export const dynamic = 'force-dynamic'`,
  and there is no `revalidate` or tag-based cache anywhere in `src/`. Price, stock and cart state are
  therefore always current, at the cost of one SQLite read per render. For a real catalogue behind
  traffic, the intended change is to drop `force-dynamic` on the browse routes (`/`, `/shop`,
  `/collections/*`, `/product/*`), add `export const revalidate = 300`, and call
  `revalidateTag('product:'+slug)` from the admin write paths. It is deliberately not done here:
  caching a page that reads the session cookie would be a correctness bug, and there is no traffic in
  front of this to make it worth the risk.

## Order of operations at launch

1. Deploy with `KBRANDS_LIVE_COMMERCE` **off**. The site is fully browsable, `robots.txt` disallows
   everything, and a launch banner tells visitors what this is.
2. Load verified products and their photography (`docs/sample-data.md`, `docs/product-imagery.md`) and
   run `npm run audit:guard`.
3. Fill in real policies and settings in admin — the policy pages are labelled *draft* until the owner
   approves them, and `ReviewBadge` marks fields the owner has not confirmed.
4. Only then: payment provider + secret, shipping provider, `KBRANDS_INTL_ENABLED`/`KBRANDS_COD_ENABLED`
   if actually supported, and `KBRANDS_LIVE_COMMERCE=1` (which flips `robots.txt` to allow and adds
   `/sitemap.xml`).
5. Verify a real order end to end, including the webhook and an email that actually arrives
   (`KBRANDS_EMAIL_MODE` must be configured for that — see `docs/integrations.md`).

Step 4 is where money and legal commitments start, so it needs the owner's explicit sign-off; nothing
in this repository flips it automatically.

## SEO notes that are tied to deployment

`src/app/product/[slug]/page.tsx` emits `Product` JSON-LD **only for non-sample rows** — an
`Offer/price/availability` block built from demo data would be a false claim in the index, and a
crawler that has already cached it cannot be un-told later. Canonical URLs come from
`KBRANDS_SITE_URL`, so changing the origin after indexing means moving canonicals too.
