# Integrations

The rule this repo follows for every external service: **an unconfigured integration says so in the
interface and does nothing, rather than pretending.** No adapter is allowed to fabricate a
confirmation, a tracking number, a delivery, a review or a stock movement.

## Payments

`src/adapters/payment.ts`, selected by `KBRANDS_PAYMENT_PROVIDER`.

| Provider | State |
| --- | --- |
| `none` (default) | No payment method is offered as live. Checkout can only produce a sandbox order, and only with `KBRANDS_SANDBOX_ORDERS=1`. |
| `mock_sandbox` | Implemented, and the only one implemented. Records a `payments` row with `provider_mode = 'mock'` (`src/adapters/payment.ts`), and both the customer order page and the admin order page label the order as confirmed by the mock adapter — so a test order cannot be mistaken for money received. |
| Razorpay / Stripe / any real gateway | **Not implemented.** Adding one means a server-side order creation call, a signature-verifying webhook handler and a reconciliation job. It is a decision to be made with the merchant's own account, keys and PCI posture, not a config value to flip. |

Nothing in this app ever sees a card number: there is no field for one, and no payment token is stored
in a place a page can read. `KBRANDS_PAYMENT_SECRET` is only ever compared with.

### Webhooks

`POST /api/payments/webhook/<provider>` (currently `mock_sandbox`):

1. the raw body is read first, because the signature is computed over the bytes;
2. `x-kbrands-mock-signature` must equal `hex(hmac_sha256(rawBody, KBRANDS_APP_SECRET))`, compared in
   constant time (`timingSafeEqualStr`);
3. a payload that fails verification is **stored for review and changes nothing**;
4. a payload that repeats an already-applied event answers 200, so the provider stops retrying;
5. only the amount and currency the provider states are compared against the order's own recomputed
   total before a status moves — an event that disagrees with the order is recorded, not applied.

A real gateway uses its own scheme (Razorpay uses a webhook secret over the raw body; Stripe uses
`Stripe-Signature` with a timestamp tolerance), which is why the verifier is per-route rather than
shared. A live deployment must replay-test it against the provider's sandbox before going live.

### Duplicate orders

Independent of the gateway: `orders.idempotency_key` is checked inside the same transaction that
inserts the order, and a repeat of the same key returns the original order with `duplicate: true`. A
double-click, a browser retry or a re-delivered webhook cannot create a second order or charge stock
twice.

## Shipping

`src/adapters/shipping.ts`. Rate quotes and labels require
`KBRANDS_LIVE_COMMERCE=1` **and** `KBRANDS_SHIPPING_PROVIDER` **and** `KBRANDS_SHIPPING_API_KEY`
(`liveConfigured`, line 88). Otherwise:

* `quote()` returns `{ feeCents: 0, mode: 'unconfigured', note: 'Shipping is not configured.' }`, and
  the checkout shows that note instead of inventing a delivery charge or an ETA;
* `trackingForOrder()` returns nothing to display, and the order page says a label has not been
  generated. The file's own comment is explicit that a tracking number may not be produced here.

Carrier status updates arrive through the same webhook shape as payments (verified, reviewed if
unverifiable) — no adapter writes a "delivered" event on its own initiative.

## Email

`src/domain/notifications.ts` + `KBRANDS_EMAIL_MODE`:

| Mode | Behaviour |
| --- | --- |
| `none` (default) | A `notifications` row is written with status `skipped_no_provider`. Nothing is sent, and the order receipt says so: it reads the row and prints *"no confirmation email was sent (email transport: KBRANDS_EMAIL_MODE=none). Keep this page for your records."* rather than the earlier *"confirmation sent to …"*, which was a claim about an email that never left the server. |
| `log` | Status `queued`; the transport is a no-op, and the receipt says the confirmation is *queued, not delivered*. Useful to prove the flow fires and to inspect what would have gone out. |
| `provider` | `emailTransportReady()` also requires `KBRANDS_EMAIL_API_KEY`, and **the transport module itself is not implemented**, so configuring a key alone still sends nothing. The admin notifications route says exactly that rather than reporting success. |

Rows are deduplicated by `dedupeKey`, retried with `next_retry_at`, and exposed as a count of
`queued`/`retrying` in admin. Wiring a real provider means implementing the send and marking the row
`sent` with the provider's id — the queue shape is already there for it.

## Coupons, tax and settings — deliberately not integrations

* Coupons are evaluated server-side in `src/domain/pricing.ts`; a discount is never taken from what the
  browser sent.
* Tax is `tax_bps` on the product row, applied in the same recomputation. No GST/tax-provider
  integration exists, so no rate here should be read as a filed-rate guarantee.
* `/api/admin/settings` writes only keys present in `SETTING_DEFAULTS`, and a change that touches a
  customer-facing commitment stays flagged `ReviewBadge → Needs approval` until the owner confirms it.

## What to do before any of this goes live

1. Choose the gateway and confirm the merchant account, settlement currency and refund window.
2. Implement the adapter + webhook, then test against the provider's sandbox, including a failed
   capture and a replayed webhook.
3. Confirm COD is actually approved by the courier; until then `KBRANDS_COD_ENABLED` stays off.
4. Choose the shipping partner and get its API contract in writing (label API, pickup API, tracking
   webhook) before promising delivery dates in copy.
5. Re-run `npm run audit:guard`, `npm test`, and check that the launch banner has disappeared *because
   the settings are real* — not because a flag was flipped.
