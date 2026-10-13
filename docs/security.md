# Security and data-integrity notes

Scope: what this build actually enforces, where it is enforced, and the residual risks the owner has
to accept or fund. Nothing here is a claim of certification.

## 1. Configuration is the only switchboard

Every deployment behaviour comes from `KBRANDS_*` environment variables read in `src/lib/env.ts`
(see `docs/environment.md`). Production defaults are all *off*:

| Flag | Default in production | Effect when off |
| --- | --- | --- |
| `KBRANDS_LIVE_COMMERCE` | off | Store is browsable/testable; no real charge, shipment or COD commitment. Flips `robots.txt` and the launch banner. |
| `KBRANDS_PAYMENT_PROVIDER` | `none` | No payment adapter is configured, so no charge is possible. Live payments additionally need `..._PAYMENT_SECRET`. |
| `KBRANDS_SANDBOX_ORDERS` | off | Even test order creation is refused. |
| `KBRANDS_COD_ENABLED` | off | Cash-on-delivery is not offered. |
| `KBRANDS_INTL_ENABLED` | off | Destinations outside `KBRANDS_SUPPORTED_COUNTRIES` (default `IN`) are rejected at checkout. |
| `KBRANDS_DEMO_CATALOGUE` | off | Sample rows cannot be published (`src/domain/catalog.ts`), and the storefront shows only verified data. |

`livePaymentsAvailable` requires the switch **and** a provider **and** that provider's secret — a
half-configured gateway cannot accidentally start taking money.

## 2. Sessions, passwords, CSRF

* Session cookie `kb_session`: `HttpOnly`, `SameSite=Lax`, `Secure` in production, `Path=/`, 14 days
  (`sessionCookieOptions`). The session token is 32 random bytes (`crypto.randomBytes`); the store
  keeps only a hash of it, so a database copy does not hand over live sessions.
* Passwords: `scrypt` with per-user random salt, `N=16384, r=8, p=1`, 32-byte key, NFKC-normalised
  input, compared in constant time (`src/lib/crypto-utils.ts`). No dependency on a native module.
  A dummy hash is verified on unknown-email lookups so the response time does not reveal accounts.
* CSRF: double-submit. `src/middleware.ts` guarantees a `kb_csrf` cookie (≥24 random bytes) for every
  visitor, and `handler()` in `src/lib/api.ts` requires the matching `x-csrf-token` header on
  mutating requests, alongside an `Origin`/`Host` comparison for writes. The CSRF cookie is
  intentionally readable by JavaScript; the session cookie is not.
* Role checks: `guardAdmin()` (pages use `requireAdminPage`) verifies the session **and** the role on
  the server in every admin handler. `src/domain/auth.ts` documents that the admin role can only be
  granted from the server-side bootstrap env (`KBRANDS_BOOTSTRAP_ADMIN_*`, minimum 14-character
  password) — no public route, no hidden form field, no default password.

## 3. Checkout integrity (the part that costs money)

All of it is server-side; client state is treated as a suggestion:

* Variant ids, quantities, addresses and coupons are parsed with zod schemas (`src/lib/validation.ts`)
  and re-resolved against the database. A variant that is `inactive` or out of stock cannot be bought
  even if its id is posted directly.
* **Totals are recomputed from the database** — line prices, coupon value, tax (`tax_bps`) and shipping
  are derived server-side. The client never sends a price.
* Stock is moved with a conditional update inside `BEGIN IMMEDIATE`
  (`UPDATE variants SET reserved_qty = reserved_qty + ? WHERE id = ? AND stock_qty - reserved_qty >= ?`);
  if `changes !== 1` the transaction throws, so two shoppers cannot spend the same last unit.
* Duplicate orders: `orders.idempotency_key` is looked up before insert and a repeat returns the
  original order with `duplicate: true`. The checkout UI keys each attempt once per cart contents.
* Maximum `KBRANDS_MAX_QTY` (default 10) units per style, independent of stock.
* Payment state changes come from the webhook only. The admin UI **cannot** mark an order paid, and a
  refund requires a written reason.

## 4. Webhooks

`POST /api/payments/webhook/<provider>` verifies
`x-kbrands-mock-signature: hex(hmac_sha256(rawBody, KBRANDS_APP_SECRET))` over the **raw** body before
parsing it (`src/app/api/payments/webhook/mock_sandbox/route.ts`). A payload that fails verification is
stored for review and changes nothing; the route answers 200 to retries it has already applied, because
a provider that sees 4xx retries forever. A real gateway needs its own adapter with that provider's
signature scheme — that is a deliberate integration (`docs/integrations.md`), not a flag.

## 5. Abuse limits

Fixed-window limiter persisted in SQLite (`src/lib/rate-limit.ts`), so limits survive restarts:

`login` 8/15min · `signup` 5/h · `password_reset` 5/h · `contact` 6/h · `coupon` 20/15min ·
`checkout` 12/15min · `admin_mutation` scoped per admin id.

## 6. Logging and personal data

`recordAudit()` (`src/domain/audit.ts`) writes who did what, and:

* never the raw IP — a truncated SHA-256 of `ip|KBRANDS_DEFAULT_COUNTRY` is stored instead;
* `redact()` replaces any key containing `password`, `token`, `secret`, `otp` (and the rest of
  `SENSITIVE_KEYS`) with `[redacted]`, recursively, including inside nested metadata;
* `redactedSecretNames()` in `src/lib/env.ts` is what the admin readiness screen is allowed to show —
  names of configured secrets, never values. Passwords and payment tokens are not logged anywhere.

Reset tokens are 32 random bytes, single-use, and expire; the emailed link is the only carrier.
Customer data is scoped by `user_id` in every query.

**Guest orders.** The order number is `KB` + `yymmddHHmmss` + a sequence, so it is structured, not
secret. A guest view of `/order/<number>` therefore shows status, lines and totals, and withholds the
delivery address, phone number and contact email until the email on the order is confirmed on the page
(`confirmOrderEmail` in `src/app/order/[number]/page.tsx`): the answer is compared server-side, never
echoed into the URL, and success sets a `HttpOnly`, `SameSite=Lax` cookie holding
`orderId.issuedAt.hmac(orderId|email|issuedAt|APP_SECRET)` valid 3 hours. Attempts are limited to 6 per
order per 15 minutes (`order_verify` in `src/lib/rate-limit.ts`) so the page cannot be used to test
email/address pairs. A signed-in customer who owns the order sees everything, and someone else's order
number renders the not-found UI — deliberately 404-shaped rather than 403, so the response does not
confirm the order exists.

## 7. Headers (set in `next.config.ts`, so static assets and error pages get them too)

`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy:
strict-origin-when-cross-origin`, `Cross-Origin-Opener-Policy: same-origin`, a `Permissions-Policy`
that denies camera/mic/geolocation/usb, `Cache-Control: no-store` on `/api/*`, and
`X-Robots-Tag: noindex` on `/admin/*` and `/account/*`.

CSP is `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; form-action 'self';
frame-ancestors 'none'; base-uri 'self'; object-src 'none'; upgrade-insecure-requests`.

**Accepted residual risk:** `'unsafe-inline'` in `script-src`. Next.js 15.5 exposes no
nonce/`csp` option and the App Router bootstrap relies on inline script payloads, so a nonce policy
breaks hydration. Everything else that makes inline script dangerous is closed off (no `unsafe-eval`
in production, no remote sources, no `object`/`embed`, locked `base-uri`/`form-action`/
`frame-ancestors`) and the app accepts no user-authored HTML. `KBRANDS_DISABLE_CSP=1` exists for
local debugging only.

Images are limited to `localPatterns: ['/media/**']` — a request cannot use the optimiser to fetch an
arbitrary remote URL.

## 8. Database access and migrations

`src/db/client.ts` exposes parameterised `get`/`all`/`run`/`transaction` over `node:sqlite`; there is
no string-built SQL from request input anywhere (values are always bound). The path is
`KBRANDS_DB_PATH` → `.data/kbrands.sqlite3` → `KBRANDS_TEST_DB_PATH`, WAL + `foreign_keys = ON` +
`busy_timeout`. Schema changes go through `src/db/migrate.ts` as ordered, additive migrations that
run on boot and are no-ops once applied — so a restart never rewrites history, and
`orders`/`order_lines`/`users` rows created earlier survive an upgrade. Destructive operations are
not part of any migration; `npm run db:reset` moves files to `.data/backups/` rather than deleting
them, refuses to run in production, and needs `--yes`.

## 9. What is *not* done yet — honest gaps

* No Content-Security-Policy nonce, because Next 15.5 cannot supply one (above).
* No rate limit on storefront page views (only on the mutating/auth endpoints), no bot protection.
* No SMTP transport: `KBRANDS_EMAIL_MODE=none` queues notifications and marks them
  `skipped_no_provider`. Order emails are **not** delivered in this build.
* No real payment or shipping integration; no card data is handled anywhere, and none should be added
  without a PCI review.
* No dependency scanning / SAST configured in CI in this repository.
* No key rotation tooling for `KBRANDS_APP_SECRET`; rotating it invalidates sessions and webhook
  signatures by design.
