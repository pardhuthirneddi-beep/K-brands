# K-brands

A men's clothing storefront for the Indian market: Next.js 15 (App Router) + React 19 + TypeScript,
SQLite through `node:sqlite`, INR pricing in integer paise, and no external service required to run it
locally.

**This build is a pre-launch storefront, not a live shop.** It is fully browsable and testable; nothing
takes real money, ships a real parcel or sends a real email, because no provider is configured. The
catalogue is labelled demo data. The site says so out loud (`runtimeBanner()` in `src/lib/banner.ts`,
plus per-row Demo badges) and `robots.txt` disallows crawling until `KBRANDS_LIVE_COMMERCE=1`.

## Run it

```bash
npm install
npm run db:bootstrap      # create .data/kbrands.sqlite3 and apply the schema
npm run db:seed-demo      # 12 men's categories, 13 demo products, photography-aware
npm run dev               # http://localhost:3000
```

Admin: `/admin`, signed in with the account from `KBRANDS_BOOTSTRAP_ADMIN_EMAIL` /
`..._PASSWORD` in your `.env.local` (see `docs/environment.md`). There is no committed credential and
no default password. While the build declares itself a demo (`KBRANDS_DEMO_CATALOGUE=1`,
`KBRANDS_LIVE_COMMERCE=0`) the storefront also offers that account as a single click in the bar above the
header, so a walkthrough does not need the password handed to it; the click sends no credential and the
route 404s in every other kind of build.

## Check it

```bash
npm run typecheck     # tsc --noEmit
npm run lint          # next lint
npm test              # unit + integration + e2e smoke (e2e self-skips if no server is up)
npm run e2e:smoke     # against a running server on :3000
npm run audit:guard   # scope + demo/production data guard
```

## Layout

| Path | What lives there |
| --- | --- |
| `src/app/` | storefront, account, admin, API routes |
| `src/domain/` | catalogue, cart, pricing, orders, returns, auth, settings — all server-side |
| `src/adapters/` | payment and shipping adapters (both refuse to fake anything) |
| `src/db/` | connection + the whole migration list |
| `scripts/` | seed, guarded reset, production-data audit |
| `tests/` | unit, integration, e2e smoke |
| `public/media/` | product photography, per `docs/product-imagery.md` |
| `public/brand/` | the logo mark, per `docs/brand-assets.md` |

## Read before changing anything

* `docs/sample-data.md` — how the demo catalogue is marked, pruned and replaced.
* `docs/product-imagery.md` — the photograph-per-colourway rule that decides what is purchasable.
* `docs/responsive-and-accessibility.md` — the enforced contract, and what has *not* been measured.
* `docs/brand-assets.md` — the logo artwork and its files, palette, type, and which claims are
  deliberately absent.
* `docs/security.md` — what is enforced server-side, and the accepted CSP residual risk.
* `docs/environment.md` — every switch and its safe default.
* `docs/database.md` · `docs/deployment.md` · `docs/integrations.md`.

## Known gaps, stated plainly

* No image upload in admin: photography is placed on disk and recorded in `product_images`.
* No email transport, so order notifications are queued and marked as not sent.
* No real payment or shipping integration; only `mock_sandbox` exists.
* Policies and legal copy are labelled draft until the owner approves them.
* The e2e suite is HTTP-level (no browser automation is available in this environment), so rendered
  layout on real devices has not been observed.
