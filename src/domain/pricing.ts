import { all, get, run, transaction } from '../db/client.ts';
import * as env from '../lib/env.ts';
import { AppError } from '../lib/errors.ts';
import { capDiscount, roundMinor } from './money.ts';
import { getSetting } from './settings.ts';

/**
 * Server-side pricing. Nothing here trusts a value sent by the browser: unit
 * prices, discounts, shipping, tax and totals are all recomputed from the
 * database on every quote and again at order creation.
 */

export type PricedLine = {
  variantId: number;
  productId: number;
  slug: string;
  title: string;
  sku: string;
  size: string | null;
  color: string | null;
  unitPriceCents: number;
  compareAtCents: number | null;
  quantity: number;
  available: number;
  isSample: boolean;
  imageUrl: string | null;
  taxBps: number;
  currency: string;
  unavailable?: boolean;
  /** True when the line cannot be priced at all (delisted / unknown variant). */
  pricingBlocked?: boolean;
};

export type ShippingQuote = {
  method: string;
  label: string;
  feeCents: number;
  mode: 'configured' | 'unconfigured' | 'mock';
  note: string | null;
};

export type Quote = {
  currency: string;
  lines: PricedLine[];
  itemCount: number;
  subtotalCents: number;
  lineDiscountCents: number;
  couponCode: string | null;
  couponDiscountCents: number;
  discountCents: number;
  shipping: ShippingQuote | null;
  shippingCents: number;
  codFeeCents: number;
  taxMode: 'inclusive' | 'exclusive' | 'unconfigured';
  taxCents: number;
  taxBps: number;
  totalCents: number;
  compareAtTotalCents: number;
  blocked: { code: string; message: string } | null;
  reservationToken?: string;
};

export function defaultTaxBps(): number {
  const mode = getSetting<string>('tax.mode', 'inclusive_unconfigured');
  if (mode === 'exclusive_configured') {
    const v = getSetting<number>('tax.default_bps', 0);
    return Number.isFinite(v) && v > 0 ? Math.trunc(v) : 0;
  }
  return 0;
}

export function taxMode(): Quote['taxMode'] {
  const mode = getSetting<string>('tax.mode', 'inclusive_unconfigured');
  if (mode === 'exclusive_configured') return 'exclusive';
  if (mode === 'inclusive_configured') return 'inclusive';
  return 'unconfigured';
}

export function quoteShipping(subtotalCents: number, useCod: boolean): ShippingQuote {
  const mode = getSetting<string>('shipping.mode', 'unconfigured');
  const flat = getSetting<number | null>('shipping.flat_rate_cents', null);
  const freeAt = getSetting<number | null>('shipping.free_threshold_cents', null);
  if (mode === 'unconfigured' || flat == null) {
    return {
      method: 'unconfigured',
      label: 'Shipping not configured',
      feeCents: 0,
      mode: 'unconfigured',
      note:
        'Delivery charges and timelines are not configured yet, so this order cannot be placed for real. A courier rate quote will appear here once the shipping setup is approved.',
    };
  }
  const free = freeAt != null && subtotalCents >= freeAt;
  return {
    method: 'standard',
    label: free ? 'Standard delivery — free' : 'Standard delivery',
    feeCents: free ? 0 : Math.max(0, Math.trunc(flat)),
    mode: 'configured',
    note: null,
  };
}

export function quoteCodFee(subtotalCents: number): { enabled: boolean; feeCents: number; minCents: number | null; reason: string | null } {
  const settingEnabled = getSetting<boolean>('cod.enabled', false);
  if (!env.codEnabled || !settingEnabled) {
    return { enabled: false, feeCents: 0, minCents: null, reason: 'Cash on delivery is not offered yet.' };
  }
  const min = getSetting<number | null>('cod.min_order_cents', null);
  if (min != null && subtotalCents < min) {
    return {
      enabled: false,
      feeCents: 0,
      minCents: min,
      reason: `Cash on delivery needs an order of at least the configured minimum value.`,
    };
  }
  const fee = getSetting<number | null>('cod.fee_cents', null);
  return { enabled: true, feeCents: Math.max(0, Math.trunc(fee ?? 0)), minCents: min, reason: null };
}

export type PriceInput = {
  lines: PricedLine[];
  couponCode: string | null;
  userId: number | null;
  useCod?: boolean;
  orderId?: number | null;
};

export function pricingFromLines(input: PriceInput): Quote {
  const currency = env.currency;
  const lines = input.lines.map((l) => ({
    ...l,
    unitPriceCents: Math.max(0, Math.trunc(l.unitPriceCents)),
    quantity: Math.max(0, Math.trunc(l.quantity)),
  }));

  const subtotalCents = lines.reduce((s, l) => s + l.unitPriceCents * l.quantity, 0);
  const compareAtTotalCents = lines.reduce(
    (s, l) => s + Math.max(l.compareAtCents ?? 0, l.unitPriceCents) * l.quantity,
    0,
  );
  const lineDiscountCents = Math.max(0, compareAtTotalCents - subtotalCents);

  const coupon = input.couponCode ? evaluateCoupon(input.couponCode, subtotalCents, input.userId, input.orderId) : null;
  const couponDiscountCents = coupon?.discountCents ?? 0;

  const postCouponSubtotal = Math.max(0, subtotalCents - couponDiscountCents);
  const shipping = quoteShipping(postCouponSubtotal, Boolean(input.useCod));
  const cod = input.useCod ? quoteCodFee(postCouponSubtotal) : { enabled: false, feeCents: 0, minCents: null, reason: null };

  const mode = taxMode();
  const taxBps = defaultTaxBps();
  let taxCents = 0;
  if (mode === 'exclusive' && taxBps > 0) {
    taxCents = roundMinor((postCouponSubtotal * taxBps) / 10000);
  }

  const totalCents = Math.max(0, postCouponSubtotal + shipping.feeCents + cod.feeCents + taxCents);

  let blocked: Quote['blocked'] = null;
  const hasSample = lines.some((l) => l.isSample);
  if (lines.length === 0) blocked = { code: 'empty_cart', message: 'Your bag is empty.' };
  else if (lines.some((l) => l.unavailable))
    blocked = { code: 'unavailable_line', message: 'One or more items in your bag are no longer available.' };
  else if (lines.some((l) => l.quantity > l.available))
    blocked = { code: 'insufficient_stock', message: 'Stock changed while you were shopping. Please review your bag.' };
  else if (hasSample && !env.sandboxOrdersEnabled)
    blocked = {
      code: 'sample_catalogue',
      message: 'The catalogue currently holds development samples, which cannot be ordered for real.',
    };
  else if (shipping.mode === 'unconfigured')
    blocked = { code: 'shipping_unconfigured', message: shipping.note ?? 'Shipping is not configured yet.' };
  else if (!env.liveCommerceEnabled && !env.sandboxOrdersEnabled)
    blocked = { code: 'checkout_disabled', message: 'Checkout is not open yet.' };

  return {
    currency,
    lines,
    itemCount: lines.reduce((s, l) => s + l.quantity, 0),
    subtotalCents,
    lineDiscountCents,
    couponCode: coupon?.code ?? null,
    couponDiscountCents,
    discountCents: lineDiscountCents + couponDiscountCents,
    shipping,
    shippingCents: shipping.feeCents,
    codFeeCents: cod.feeCents,
    taxMode: mode,
    taxCents,
    taxBps,
    totalCents,
    compareAtTotalCents,
    blocked,
  };
}

/* -------------------------------------------------------------- coupons */

export type CouponRow = {
  id: number;
  code: string;
  kind: 'percent' | 'fixed';
  value: number;
  min_subtotal_cents: number;
  max_discount_cents: number | null;
  usage_limit: number | null;
  per_user_limit: number | null;
  used_count: number;
  starts_at: string | null;
  ends_at: string | null;
  active: number;
  is_sample: number;
  applies_to_category_slug: string | null;
};

export function findCoupon(code: string): CouponRow | null {
  const norm = code.trim().toUpperCase();
  if (!norm) return null;
  return get<CouponRow>('SELECT * FROM coupons WHERE code = ?', [norm]) ?? null;
}

export type CouponEvaluation = {
  code: string;
  discountCents: number;
  reason: string;
  ok: boolean;
  minSubtotalCents: number | null;
};

export function evaluateCoupon(
  code: string,
  subtotalCents: number,
  userId: number | null,
  orderId: number | null = null,
  opts: { respectUsageAgainstOrder?: number | null } = {},
): CouponEvaluation {
  const coupon = findCoupon(code);
  if (!coupon) {
    return { code: code.trim().toUpperCase(), discountCents: 0, reason: 'That code is not recognised.', ok: false, minSubtotalCents: null };
  }
  const reject = (reason: string): CouponEvaluation => ({
    code: coupon.code,
    discountCents: 0,
    reason,
    ok: false,
    minSubtotalCents: coupon.min_subtotal_cents,
  });
  const now = Date.now();
  if (!coupon.active) return reject('That code is no longer active.');
  if (coupon.starts_at && new Date(coupon.starts_at).getTime() > now) return reject('That code is not active yet.');
  if (coupon.ends_at && new Date(coupon.ends_at).getTime() < now) return reject('That code has expired.');
  if (coupon.usage_limit != null && coupon.used_count >= coupon.usage_limit) return reject('That code has been fully redeemed.');
  if (subtotalCents < coupon.min_subtotal_cents) {
    return reject('Your bag does not yet reach the minimum for that code.');
  }
  if (userId && coupon.per_user_limit != null) {
    const used =
      get<{ n: number }>(
        `SELECT COUNT(*) AS n FROM coupon_redemptions WHERE coupon_id = ? AND user_id = ? ${orderId ? 'AND order_id <> ?' : ''}`,
        orderId ? [coupon.id, userId, orderId] : [coupon.id, userId],
      )?.n ?? 0;
    if (used >= coupon.per_user_limit) return reject('You have already used that code.');
  }
  const raw =
    coupon.kind === 'percent' ? roundMinor((subtotalCents * Math.min(coupon.value, 10000)) / 10000) : coupon.value;
  const discountCents = capDiscount(Math.max(0, raw), coupon.max_discount_cents);
  void opts;
  return { code: coupon.code, discountCents, reason: 'Code applied.', ok: true, minSubtotalCents: coupon.min_subtotal_cents };
}

export function applyCouponToCart(cartKey: string, code: string): { ok: boolean; message: string } {
  const cart = get<{ id: number }>('SELECT id FROM carts WHERE key = ?', [cartKey]);
  if (!cart) throw new AppError('validation_error', 'Your bag is empty.', 400);
  const norm = code.trim().toUpperCase().slice(0, 40);
  if (!norm) {
    run('UPDATE carts SET coupon_code = NULL WHERE id = ?', [cart.id]);
    return { ok: true, message: 'Code removed.' };
  }
  if (!/^[A-Z0-9_-]{3,40}$/.test(norm)) {
    return { ok: false, message: 'That code is not in the right format.' };
  }
  const lines = getCartLinesForPricing(cart.id);
  const subtotal = lines.reduce((s, l) => s + l.unitPriceCents * l.quantity, 0);
  const res = evaluateCoupon(norm, subtotal, null);
  if (!res.ok) return { ok: false, message: res.reason };
  run('UPDATE carts SET coupon_code = ?, updated_at = ? WHERE id = ?', [res.code, new Date().toISOString(), cart.id]);
  return { ok: true, message: res.reason };
}

function getCartLinesForPricing(cartId: number): { unitPriceCents: number; quantity: number }[] {
  return all<{ unit: number; qty: number }>(
    `SELECT COALESCE(v.price_cents, p.price_cents) AS unit, cl.quantity AS qty
     FROM cart_lines cl JOIN variants v ON v.id = cl.variant_id JOIN products p ON p.id = v.product_id
     WHERE cl.cart_id = ?`,
    [cartId],
  ).map((r) => ({ unitPriceCents: r.unit, quantity: r.qty }));
}

export function listCoupons() {
  return all<CouponRow & { redemptions: number }>(
    `SELECT c.*, (SELECT COUNT(*) FROM coupon_redemptions r WHERE r.coupon_id = c.id) AS redemptions
     FROM coupons c ORDER BY c.id DESC LIMIT 200`,
  );
}

export function upsertCoupon(input: {
  code: string;
  kind: 'percent' | 'fixed';
  value: number;
  minSubtotalCents?: number;
  maxDiscountCents?: number | null;
  usageLimit?: number | null;
  perUserLimit?: number | null;
  startsAt?: string | null;
  endsAt?: string | null;
  active?: boolean;
  isSample?: boolean;
  appliesToCategorySlug?: string | null;
}): { id: number } {
  const code = input.code.trim().toUpperCase();
  if (!/^[A-Z0-9_-]{3,40}$/.test(code)) throw new AppError('validation_error', 'Codes must be 3–40 characters (A–Z, 0–9, - or _).', 400);
  if (input.kind === 'percent' && (input.value < 1 || input.value > 10000)) {
    throw new AppError('validation_error', 'Percent must be between 0.01% and 100%.', 400);
  }
  if (input.kind === 'fixed' && input.value <= 0) {
    throw new AppError('validation_error', 'A fixed discount must be greater than zero.', 400);
  }
  const ts = new Date().toISOString();
  return transaction(() => {
    const existing = get<{ id: number }>('SELECT id FROM coupons WHERE code = ?', [code]);
    const params = [
      input.kind,
      input.value,
      Math.max(0, input.minSubtotalCents ?? 0),
      input.maxDiscountCents ?? null,
      input.usageLimit ?? null,
      input.perUserLimit ?? null,
      input.startsAt ?? null,
      input.endsAt ?? null,
      input.active === false ? 0 : 1,
      input.isSample === true ? 1 : 0,
      input.appliesToCategorySlug ?? null,
    ];
    if (existing) {
      run(
        `UPDATE coupons SET kind = ?, value = ?, min_subtotal_cents = ?, max_discount_cents = ?, usage_limit = ?,
         per_user_limit = ?, starts_at = ?, ends_at = ?, active = ?, is_sample = ?, applies_to_category_slug = ?, updated_at = ?
         WHERE id = ?`,
        [...params, ts, existing.id],
      );
      return { id: existing.id };
    }
    // `used_count` is left out deliberately: it has a schema DEFAULT of 0 and must never
    // be writable from this path — only redeemCoupon() moves it. Listing it in the column
    // list is how the placeholders shifted by one and starts_at landed in used_count.
    const res = run(
      `INSERT INTO coupons (code, kind, value, min_subtotal_cents, max_discount_cents, usage_limit, per_user_limit,
        starts_at, ends_at, active, is_sample, applies_to_category_slug, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [code, ...params, ts, ts],
    );
    return { id: res.lastInsertRowid };
  });
}

export function redeemCoupon(couponId: number, orderId: number, userId: number | null, discountCents: number): void {
  transaction(() => {
    const already = get<{ id: number }>('SELECT id FROM coupon_redemptions WHERE coupon_id = ? AND order_id = ?', [
      couponId,
      orderId,
    ]);
    if (already) return; // idempotent: one redemption per order per coupon
    run(
      `INSERT INTO coupon_redemptions (coupon_id, order_id, user_id, discount_cents, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [couponId, orderId, userId, discountCents, new Date().toISOString()],
    );
    run('UPDATE coupons SET used_count = used_count + 1 WHERE id = ?', [couponId]);
  });
}
