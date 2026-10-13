# Environment configuration

All runtime behaviour is configured by `KBRANDS_*` variables read in `src/lib/env.ts` (and two in
`next.config.ts`). Nothing is committed: `.env.local` is git-ignored and a deployment must not carry
the local copy of it.

There are **no `NEXT_PUBLIC_*` variables in this project** — nothing in `src/app` or
`src/components` reads a secret, and the build would fail if one appeared.

## Required

| Name | Notes |
| --- | --- |
| `KBRANDS_APP_SECRET` | Session signing, CSRF tokens and webhook signature checks. **Mandatory in production** — `requireServerCryptoSecret()` throws otherwise. In development it falls back to a fixed, loudly-named dev value so local work needs no secret file. Rotating it invalidates every session and every webhook signature, by design. |
| `KBRANDS_SITE_URL` | Canonical origin for metadata, `sitemap.xml`, JSON-LD `url`s and OG tags. Trailing slash is stripped. |

## Behaviour switches (all default to the safe side)

| Name | Default | Effect |
| --- | --- | --- |
| `KBRANDS_LIVE_COMMERCE` | `false` | Master switch. Off: launch banner, `robots.txt` = `disallow: /`, "not configured yet" policy copy, no real charge/shipment/COD. |
| `KBRANDS_DEMO_CATALOGUE` | `!isProduction` | Whether sample rows may be shown/published. `docs/sample-data.md`. |
| `KBRANDS_SANDBOX_ORDERS` | `!isProduction` | Off refuses order creation even in sandbox. |
| `KBRANDS_PAYMENT_PROVIDER` | `none` | `mock_sandbox` is the only adapter implemented. Live payments additionally need `KBRANDS_PAYMENT_SECRET`. |
| `KBRANDS_MOCK_PAYMENT_SCENARIO` | unset | Forces a mock outcome for testing failure handling. |
| `KBRANDS_COD_ENABLED` | `false` | Cash-on-delivery is opt-in and never inferred. |
| `KBRANDS_INTL_ENABLED` | `false` | International destinations. |
| `KBRANDS_DEFAULT_COUNTRY` | `IN` | Used for the audit IP hash salt, address defaults and tax locale. |
| `KBRANDS_SUPPORTED_COUNTRIES` | `IN` | CSV allowlist enforced at checkout. |
| `KBRANDS_CURRENCY` | `INR` | Money is integer **paise** everywhere; see `docs/database.md`. |
| `KBRANDS_EMAIL_MODE` | `none` | `none` → a notification row is written with status `skipped_no_provider`; `log` → status `queued`, nothing is delivered; `provider` → needs `KBRANDS_EMAIL_API_KEY` **and** a transport module, which is not implemented in this build. `docs/integrations.md`. |
| `KBRANDS_EMAIL_FROM` | `K-brands <replies@unconfigured.invalid>` | Never used to imply a delivery happened. |
| `KBRANDS_SHIPPING_PROVIDER` / `KBRANDS_SHIPPING_API_KEY` | `none` / unset | No live label is produced without both, and never without `KBRANDS_LIVE_COMMERCE=1`. |
| `KBRANDS_BOOTSTRAP_ADMIN_EMAIL` / `..._PASSWORD` | unset | The only way an admin exists. Password must be ≥ 14 chars. No default password anywhere. |

## Limits and timers

| Name | Default |
| --- | --- |
| `KBRANDS_MAX_QTY` | `10` units per line, independent of stock |
| `KBRANDS_RESERVATION_MINUTES` | `20` — how long a cart/checkout hold on stock lasts. Expired holds are released by `expireStaleReservations()` in `src/domain/inventory.ts`, which runs before each reservation pass (floored at 2 minutes) |
| `KBRANDS_SESSION_DAYS` | `14` |

## Database paths

| Name | Notes |
| --- | --- |
| `KBRANDS_DB_PATH` | Overrides the file location entirely (used by nothing in the app's own flow; for tooling). |
| `KBRANDS_TEST_DB_PATH` | Fallback used by integration tests, which point it at a temporary file so they never touch `.data/kbrands.sqlite3`. |

Resolution order is in `docs/database.md`.

## Build-time only

| Name | Notes |
| --- | --- |
| `KBRANDS_DISABLE_CSP` | `1` removes the Content-Security-Policy header. **Local debugging only**; there is no legitimate use in a deployment. |
| `NODE_ENV` | Drives `isProduction`: secure cookies, `upgrade-insecure-requests`, publish gating. |

## Listing what is configured without leaking it

`src/lib/env.ts` exposes `configuredSecrets` / `redactedSecretNames()` — the **names** of sensitive
variables that are present, never their values. The admin readiness screen prints those names.
`recordAudit()` redacts any metadata key containing `password`, `token`, `secret` or `otp`, so nothing
sensitive reaches the audit table either.
