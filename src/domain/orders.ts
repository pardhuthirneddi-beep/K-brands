import crypto from 'node:crypto';
import { all, get, run, transaction } from '../db/client.ts';
import * as env from '../lib/env.ts';
import { AppError } from '../lib/errors.ts';
import { captureForOrder, expireStaleReservations, getReservation, restock } from './inventory.ts';
import { pricingFromLines, redeemCoupon, findCoupon, type Quote } from './pricing.ts';
import { getCartLines, loadOrCreateCart, clearCart } from './cart.ts';
import { recordAudit } from './audit.ts';
import { enqueueNotification } from './notifications.ts';
import { getSetting } from './settings.ts';

/**
 * Orders and their state machine.
 *
 * Rules enforced here:
 *  - Totals are recomputed on the server from the DB, never taken from the client.
 *  - Stock is captured inside the same transaction as the order rows.
 *  - An order is only ever marked `paid` by a verified server-side payment event.
 *  - Illegal state transitions are rejected.
 */

export type OrderStatus =
  | 'pending_payment'
  | 'awaiting_payment_confirmation'
  | 'paid'
  | 'awaiting_fulfilment'
  | 'packed'
  | 'shipped'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled'
  | 'cancellation_requested'
  | 'returns_requested'
  | 'returned'
  | 'refunded'
  | 'partially_refunded'
  | 'payment_failed'
  | 'expired';

// Transition table lives in orders-state.ts so the state machine has exactly one definition.

import { canTransition } from './orders-state.ts';

export { canTransition };

export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (from === to) return;
  if (!canTransition(from, to)) {
    throw new AppError(
      'state_conflict',
      `An order in the “${humanStatus(from)}” state cannot move to “${humanStatus(to)}”.`,
      409,
    );
  }
}

export const STATUS_LABELS: Record<OrderStatus, string> = {
  pending_payment: 'Awaiting payment',
  awaiting_payment_confirmation: 'Confirming payment',
  paid: 'Payment received',
  awaiting_fulfilment: 'Preparing for dispatch',
  packed: 'Packed',
  shipped: 'Shipped',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  cancellation_requested: 'Cancellation requested',
  returns_requested: 'Return requested',
  returned: 'Returned',
  refunded: 'Refunded',
  partially_refunded: 'Partially refunded',
  payment_failed: 'Payment failed',
  expired: 'Expired',
};

export function humanStatus(s: string): string {
  return STATUS_LABELS[s as OrderStatus] ?? s.replace(/_/g, ' ');
}

export type AddressInput = {
  recipientName: string;
  phone: string;
  line1: string;
  line2?: string | null;
  locality?: string | null;
  city: string;
  stateCode: string;
  stateName: string;
  pincode: string;
  countryCode?: string;
};

export function newOrderNumber(): string {
  const stamp = new Date();
  const ymd = `${String(stamp.getFullYear()).slice(2)}${String(stamp.getMonth() + 1).padStart(2, '0')}${String(
    stamp.getDate(),
  ).padStart(2, '0')}`;
  const rand = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
  return `KB${ymd}${rand}`;
}

const nowIso = () => new Date().toISOString();

export type PlaceOrderResult = {
  orderNumber: string;
  orderId: number;
  totalCents: number;
  currency: string;
  isSandbox: boolean;
  quote: Quote;
  reused: boolean;
};

/**
 * Place an order from the current cart. Idempotent on `idempotencyKey`:
 * a double submit (double-click, refresh-after-post, retry) returns the
 * original order instead of creating a second one or a second charge.
 */
export function placeOrder(input: {
  cartKey: string | null;
  userId: number | null;
  email: string;
  phone: string;
  shipping: AddressInput;
  billing?: AddressInput | null;
  useCod: boolean;
  idempotencyKey: string;
  customerNote?: string | null;
  ip?: string | null;
}): PlaceOrderResult {
  if (!env.liveCommerceEnabled && !env.sandboxOrdersEnabled) {
    throw new AppError('feature_disabled', 'Checkout is not open yet. Please check back soon.', 503);
  }
  if (input.useCod && !env.codEnabled) {
    throw new AppError('policy_not_configured', 'Cash on delivery is not available for this store yet.', 503);
  }
  if (input.shipping.countryCode && input.shipping.countryCode !== 'IN' && !env.internationalShippingEnabled) {
    throw new AppError(
      'shipping_unavailable',
      'We only ship within India right now. International delivery is not enabled yet.',
      503,
    );
  }
  if (!input.cartKey) throw new AppError('validation_error', 'Your bag is empty.', 400);
  const cartKey: string = input.cartKey;
  expireStaleReservations();

  return transaction(() => {
    const prior = get<{ id: number; order_number: string; total_cents: number; currency: string }>(
      'SELECT id, order_number, total_cents, currency FROM orders WHERE idempotency_key = ?',
      [input.idempotencyKey],
    );
    if (prior) {
      return {
        orderNumber: prior.order_number,
        orderId: prior.id,
        totalCents: prior.total_cents,
        currency: prior.currency,
        isSandbox: true,
        quote: null as unknown as Quote,
        reused: true,
      };
    }

    const cartId = loadOrCreateCart(cartKey);
    const lines = getCartLines(cartId);
    if (lines.length === 0) throw new AppError('validation_error', 'Your bag is empty.', 400);
    const couponCode = get<{ coupon_code: string | null }>('SELECT coupon_code FROM carts WHERE id = ?', [cartId])
      ?.coupon_code;
    const quote = pricingFromLines({ lines, couponCode: couponCode ?? null, userId: input.userId, useCod: input.useCod });
    if (quote.blocked) throw new AppError(quote.blocked.code as never, quote.blocked.message, 422);

    // Live mode must never sell sample catalogue records. Sandbox-only guard.
    const hasSample = quote.lines.some((l) => l.isSample);
    if (hasSample && env.liveCommerceEnabled) {
      throw new AppError(
        'policy_not_configured',
        'This order contains development samples. Replace them with verified products before selling live.',
        503,
      );
    }

    const reservationToken = `res:${cartKey}`;
    const reservation = getReservation(reservationToken);
    const reservationMatches =
      reservation &&
      reservation.lines.length === quote.lines.length &&
      quote.lines.every((l) =>
        reservation.lines.some((r) => r.variant_id === l.variantId && r.quantity === l.quantity),
      );
    if (!reservationMatches) {
      throw new AppError(
        'conflict',
        'Your bag changed while you were checking out. We refreshed the totals — please confirm once more.',
        409,
      );
    }

    const ts = nowIso();
    const isSandbox = !env.livePaymentsAvailable;
    const orderRes = run(
      `INSERT INTO orders (order_number, user_id, guest_email, contact_phone, currency, subtotal_cents, discount_cents,
          shipping_cents, tax_cents, cod_fee_cents, total_cents, coupon_code, status, payment_status, fulfilment_status,
          is_sample_order, idempotency_key, customer_note, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        newOrderNumber(),
        input.userId,
        input.email.toLowerCase(),
        input.phone,
        quote.currency,
        quote.subtotalCents,
        quote.discountCents,
        quote.shippingCents,
        quote.taxCents,
        quote.codFeeCents,
        quote.totalCents,
        quote.couponCode,
        'pending_payment',
        'unpaid',
        'unfulfilled',
        hasSample ? 1 : 0,
        input.idempotencyKey,
        input.customerNote?.slice(0, 500) ?? null,
        ts,
        ts,
      ],
    );
    const orderId = orderRes.lastInsertRowid;
    const orderNumber = get<{ order_number: string }>('SELECT order_number FROM orders WHERE id = ?', [orderId])!
      .order_number;

    for (const l of quote.lines) {
      const lineTotal = l.unitPriceCents * l.quantity;
      const lineTax = quote.taxMode === 'exclusive' ? Math.round((lineTotal * quote.taxBps) / 10000) : 0;
      run(
        `INSERT INTO order_lines (order_id, product_id, variant_id, snapshot_title, snapshot_slug, snapshot_sku,
            snapshot_size, snapshot_color, snapshot_image_url, unit_price_cents, compare_at_price_cents, quantity,
            line_tax_cents, line_discount_cents, line_total_cents, is_sample, tax_bps, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          orderId,
          l.productId || null,
          l.variantId,
          l.title,
          l.slug,
          l.sku,
          l.size,
          l.color,
          l.imageUrl,
          l.unitPriceCents,
          l.compareAtCents,
          l.quantity,
          lineTax,
          0,
          lineTotal + lineTax,
          l.isSample ? 1 : 0,
          l.taxBps,
          ts,
        ],
      );
    }

    const insertAddress = (kind: 'shipping' | 'billing', a: AddressInput) =>
      run(
        `INSERT INTO shipping_addresses (order_id, kind, recipient_name, phone, line1, line2, locality, city,
            state_code, state_name, pincode, country_code, address_hash, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          orderId,
          kind,
          a.recipientName,
          a.phone,
          a.line1,
          a.line2 ?? null,
          a.locality ?? null,
          a.city,
          a.stateCode,
          a.stateName,
          a.pincode,
          a.countryCode ?? 'IN',
          crypto.createHash('sha256').update(`${a.phone}|${a.line1}|${a.pincode}`).digest('hex').slice(0, 16),
          ts,
        ],
      );
    insertAddress('shipping', input.shipping);
    insertAddress('billing', input.billing ?? input.shipping);

    run(
      `INSERT INTO order_events (order_id, event, to_status, actor_user_id, detail, created_at)
       VALUES (?, 'created', 'pending_payment', ?, ?, ?)`,
      [orderId, input.userId, `placed with ${String(quote.itemCount)} item(s)`, ts],
    );

    captureForOrder(reservationToken, orderId);

    if (quote.couponCode) {
      const coupon = findCoupon(quote.couponCode);
      if (coupon && quote.couponDiscountCents > 0) redeemCoupon(coupon.id, orderId, input.userId, quote.couponDiscountCents);
    }

    clearCart(cartKey);

    // Payment intent: created server-side, never trusted from the browser.
    if (input.useCod) {
      run(
        `INSERT INTO payments (order_id, provider, provider_mode, method, amount_cents, currency, status, idempotency_key, created_at, updated_at)
         VALUES (?, 'cod', 'mock', 'cash_on_delivery', ?, ?, 'pending', ?, ?, ?)`,
        [orderId, quote.totalCents, quote.currency, `cod:${input.idempotencyKey}`, ts, ts],
      );
    } else {
      const provider = env.paymentProvider === 'none' ? 'mock_gateway' : env.paymentProvider;
      run(
        `INSERT INTO payments (order_id, provider, provider_mode, method, amount_cents, currency, status, idempotency_key, created_at, updated_at)
         VALUES (?, ?, ?, 'gateway', ?, ?, 'initiated', ?, ?, ?)`,
        [
          orderId,
          provider,
          env.livePaymentsAvailable ? 'live' : 'mock',
          quote.totalCents,
          quote.currency,
          `intent:${input.idempotencyKey}`,
          ts,
          ts,
        ],
      );
    }

    recordAudit({
      action: 'order.create',
      targetType: 'order',
      targetId: orderNumber,
      actorUserId: input.userId,
      actorRole: input.userId ? 'customer' : 'guest',
      summary: `Order ${orderNumber} created (${env.livePaymentsAvailable ? 'live' : 'sandbox'}) for ${String(quote.totalCents)} paise`,
      ip: input.ip,
    });
    enqueueNotification({
      template: 'order_created',
      recipient: input.email,
      dedupeKey: `order_created:${orderNumber}`,
      subject: `Your K-brands order ${orderNumber}`,
      bodyText: [
        `Thank you — we have received order ${orderNumber}.`,
        '',
        `Items: ${String(quote.itemCount)}`,
        `Total: ${String(quote.totalCents / 100)} ${quote.currency}`,
        '',
        isSandbox
          ? 'This store is in pre-launch testing mode: no payment has been taken and nothing will be dispatched.'
          : 'We will email you again when your order is confirmed for dispatch.',
      ].join('\n'),
      relatedType: 'order',
      relatedId: orderNumber,
    });

    return {
      orderNumber,
      orderId,
      totalCents: quote.totalCents,
      currency: quote.currency,
      isSandbox,
      quote,
      reused: false,
    };
  });
}

/* ------------------------------------------------------------- transitions */

export function getOrderById(orderId: number) {
  return get<Record<string, unknown>>('SELECT * FROM orders WHERE id = ?', [orderId]);
}

export function getOrderByNumber(orderNumber: string) {
  return get<Record<string, unknown>>('SELECT * FROM orders WHERE order_number = ?', [orderNumber.trim().toUpperCase()]);
}

export function transitionOrder(
  orderId: number,
  to: OrderStatus,
  opts: { actorUserId: number | null; actorRole: string; detail?: string; ip?: string | null },
): OrderStatus {
  return transaction(() => {
    const order = get<{ id: number; order_number: string; status: OrderStatus }>(
      'SELECT id, order_number, status FROM orders WHERE id = ?',
      [orderId],
    );
    if (!order) throw new AppError('not_found', 'Order not found.', 404);
    assertTransition(order.status, to);
    const ts = nowIso();
    // `fulfilment_status` is the warehouse-facing column the admin list and dashboard
    // display, so it is derived here rather than left to drift: an order the customer
    // can see as "Shipped" must never read "unfulfilled" in the operations queue.
    const fulfilment = fulfilmentForStatus(to);
    const deliveredAt = to === 'delivered' ? ts : undefined;
    if (fulfilment) {
      run('UPDATE orders SET status = ?, updated_at = ?, fulfilment_status = ? WHERE id = ?', [to, ts, fulfilment, orderId]);
    } else {
      run('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?', [to, ts, orderId]);
    }
    if (deliveredAt) run('UPDATE orders SET delivered_at = ? WHERE id = ? AND delivered_at IS NULL', [deliveredAt, orderId]);
    run(
      `INSERT INTO order_events (order_id, event, from_status, to_status, actor_user_id, detail, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [orderId, `status:${to}`, order.status, to, opts.actorUserId, opts.detail?.slice(0, 300) ?? null, ts],
    );
    recordAudit({
      action: `order.${to}`,
      targetType: 'order',
      targetId: order.order_number,
      actorUserId: opts.actorUserId,
      actorRole: opts.actorRole,
      summary: `${order.order_number}: ${humanStatus(order.status)} → ${humanStatus(to)}`,
      ip: opts.ip,
    });
    return to;
  });
}

/** Which warehouse-facing state an order status implies, or null to leave it alone. */
function fulfilmentForStatus(to: OrderStatus): 'unfulfilled' | 'in_progress' | 'shipped' | 'delivered' | 'cancelled' | null {
  switch (to) {
    case 'awaiting_fulfilment':
    case 'packed':
      return 'in_progress';
    case 'shipped':
    case 'out_for_delivery':
      return 'shipped';
    case 'delivered':
    case 'returned':
      return 'delivered';
    case 'cancelled':
      return 'cancelled';
    default:
      // Requests (cancellation/returns) and payment states say nothing about fulfilment.
      return null;
  }
}

/** Customer-facing cancellation request, gated by the configured window. */
export function requestCancellation(input: {
  orderNumber: string;
  userId: number | null;
  reason: string;
  detail?: string;
  ip?: string | null;
}): { status: string; message: string } {
  return transaction(() => {
    const order = get<{
      id: number;
      status: OrderStatus;
      placed_at: string | null;
      created_at: string;
      user_id: number | null;
      guest_email: string | null;
    }>(
      'SELECT id, status, placed_at, created_at, user_id, guest_email FROM orders WHERE order_number = ?',
      [input.orderNumber.trim().toUpperCase()],
    );
    if (!order) throw new AppError('not_found', 'We could not find that order.', 404);
    if (input.userId && order.user_id !== input.userId) {
      throw new AppError('not_found', 'We could not find that order.', 404);
    }
    const windowMinutes = getSetting<number | null>('cancellation.window_minutes', null);
    if (windowMinutes == null) {
      throw new AppError(
        'policy_not_configured',
        'The cancellation window for this store has not been configured yet, so we cannot accept an online cancellation. Please use the contact details once they are published.',
        503,
      );
    }
    const placedAt = new Date(order.placed_at ?? order.created_at).getTime();
    const elapsedMinutes = (Date.now() - placedAt) / 60_000;
    if (elapsedMinutes > windowMinutes) {
      return {
        status: 'rejected_window',
        message:
          'This order is past the cancellation window, so it can no longer be cancelled online. If it has not shipped, reply to your confirmation email and we will help.',
      };
    }
    if (['shipped', 'out_for_delivery', 'delivered'].includes(order.status)) {
      return { status: 'rejected_shipped', message: 'This order has already been dispatched and cannot be cancelled. A return can be requested instead.' };
    }
    assertTransition(order.status, 'cancellation_requested');
    const ts = nowIso();
    run("UPDATE orders SET status = 'cancellation_requested', updated_at = ? WHERE id = ?", [ts, order.id]);
    run(
      `INSERT INTO order_events (order_id, event, from_status, to_status, actor_user_id, detail, created_at)
       VALUES (?, 'cancellation_requested', ?, 'cancellation_requested', ?, ?, ?)`,
      [order.id, order.status, input.userId, input.reason.slice(0, 80), (input.detail ?? '').slice(0, 400), ts],
    );
    recordAudit({
      action: 'order.cancellation_requested',
      targetType: 'order',
      targetId: input.orderNumber,
      actorUserId: input.userId,
      actorRole: 'customer',
      summary: `Cancellation requested (${input.reason})`,
      ip: input.ip,
    });
    return { status: 'requested', message: 'We have received your cancellation request and will confirm by email.' };
  });
}

export function resolveCancellation(
  orderId: number,
  approve: boolean,
  actor: { userId: number; role: string },
): void {
  transaction(() => {
    const order = get<{ id: number; order_number: string; status: OrderStatus; payment_status: string; is_sample_order: number }>(
      'SELECT id, order_number, status, payment_status, is_sample_order FROM orders WHERE id = ?',
      [orderId],
    );
    if (!order) throw new AppError('not_found', 'Order not found.', 404);
    if (!approve) {
      const backTo: OrderStatus = order.payment_status === 'captured' ? 'paid' : 'pending_payment';
      assertTransition(order.status, backTo);
      run('UPDATE orders SET status = ?, cancellation_status = ?, updated_at = ? WHERE id = ?', [
        backTo,
        'rejected',
        nowIso(),
      ]);
      run(
        `INSERT INTO order_events (order_id, event, from_status, to_status, actor_user_id, detail, created_at)
         VALUES (?, 'cancellation_rejected', 'cancellation_requested', ?, ?, 'request declined', ?)`,
        [orderId, backTo, actor.userId, nowIso()],
      );
      recordAudit({
        action: 'order.cancellation_rejected',
        targetType: 'order',
        targetId: order.order_number,
        actorUserId: actor.userId,
        actorRole: actor.role,
        summary: `Cancellation declined for ${order.order_number}`,
      });
      return;
    }
    assertTransition(order.status, 'cancelled');
    const ts = nowIso();
    run("UPDATE orders SET status = 'cancelled', cancellation_status = 'completed', cancelled_at = ?, updated_at = ? WHERE id = ?", [
      ts,
      ts,
      orderId,
    ]);
    // Put reserved/sold units back and record why.
    const lines = all<{ variant_id: number; quantity: number }>(
      'SELECT variant_id, quantity FROM order_lines WHERE order_id = ? AND variant_id IS NOT NULL',
      [orderId],
    );
    for (const l of lines) {
      if (!l.variant_id) continue;
      restock(l.variant_id, l.quantity, 'order', String(orderId), actor.userId, 'stock returned after cancellation');
    }
    run(
      `INSERT INTO order_events (order_id, event, from_status, to_status, actor_user_id, detail, created_at)
       VALUES (?, 'cancelled', 'cancellation_requested', 'cancelled', ?, 'approved by admin', ?)`,
      [orderId, actor.userId, ts],
    );
    const captured = order.payment_status === 'captured' || order.payment_status === 'authorized';
    if (captured) {
      run("UPDATE orders SET refund_status = 'requested', updated_at = ? WHERE id = ?", [ts, orderId]);
    }
    recordAudit({
      action: 'order.cancelled',
      targetType: 'order',
      targetId: order.order_number,
      actorUserId: actor.userId,
      actorRole: actor.role,
      summary: `Order ${order.order_number} cancelled; ${String(lines.length)} line(s) restocked${captured ? '; refund required' : ''}`,
    });
    const email = get<{ guest_email: string | null; email: string | null }>(
      `SELECT o.guest_email, u.email FROM orders o LEFT JOIN users u ON u.id = o.user_id WHERE o.id = ?`,
      [orderId],
    );
    const recipient = email?.email ?? email?.guest_email;
    if (recipient) {
      enqueueNotification({
        template: 'order_cancelled',
        recipient,
        dedupeKey: `order_cancelled:${order.order_number}`,
        subject: `Your K-brands order ${order.order_number} has been cancelled`,
        bodyText: `Your order ${order.order_number} has been cancelled.${captured ? ' Any amount collected will be refunded through the original payment method.' : ''}`,
        relatedType: 'order',
        relatedId: order.order_number,
      });
    }
  });
}

export function orderSummary(orderId: number) {
  const order = get<Record<string, unknown>>('SELECT * FROM orders WHERE id = ?', [orderId]);
  if (!order) return null;
  const lines = all<Record<string, unknown>>('SELECT * FROM order_lines WHERE order_id = ? ORDER BY id', [orderId]);
  const addresses = all<Record<string, unknown>>(
    'SELECT * FROM shipping_addresses WHERE order_id = ? ORDER BY id',
    [orderId],
  );
  const payments = all<Record<string, unknown>>(
    'SELECT id, provider, provider_mode, method, amount_cents, currency, status, failure_message, verified_at, created_at FROM payments WHERE order_id = ? ORDER BY id',
    [orderId],
  );
  const shipments = all<Record<string, unknown>>(
    'SELECT id, provider, provider_mode, tracking_number, courier, service, status, estimated_delivery_date, shipped_at, delivered_at FROM shipments WHERE order_id = ? ORDER BY id',
    [orderId],
  );
  const returns = all<Record<string, unknown>>(
    'SELECT id, reference, type, reason_code, status, refund_status, created_at, decided_at FROM returns WHERE order_id = ? ORDER BY id',
    [orderId],
  );
  const events = all<Record<string, unknown>>(
    'SELECT event, from_status, to_status, detail, created_at FROM order_events WHERE order_id = ? ORDER BY id DESC LIMIT 60',
    [orderId],
  );
  const refunds = all<Record<string, unknown>>(
    'SELECT id, amount_cents, status, reason, provider, created_at, issued_at FROM refunds WHERE order_id = ? ORDER BY id',
    [orderId],
  );
  return { order, lines, addresses, payments, shipments, returns, events, refunds };
}

export function listOrdersForUser(userId: number, limit = 50) {
  return all<Record<string, unknown>>(
    `SELECT o.*, (SELECT COUNT(*) FROM order_lines l WHERE l.order_id = o.id) AS line_count
     FROM orders o WHERE o.user_id = ? ORDER BY o.id DESC LIMIT ?`,
    [userId, Math.min(limit, 100)],
  );
}

export function listOrdersAdmin(opts: { status?: string; q?: string; limit?: number } = {}) {
  const clauses: string[] = [];
  const params: (string | number)[] = [];
  if (opts.status) {
    clauses.push('o.status = ?');
    params.push(opts.status);
  }
  if (opts.q?.trim()) {
    clauses.push('(o.order_number LIKE ? OR o.guest_email LIKE ? OR u.email LIKE ?)');
    const like = `%${opts.q.trim().toLowerCase().slice(0, 60)}%`;
    params.push(like, like, like);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return all<Record<string, unknown>>(
    `SELECT o.*, COALESCE(u.email, o.guest_email) AS contact_email, u.full_name,
            (SELECT COUNT(*) FROM order_lines l WHERE l.order_id = o.id) AS line_count
     FROM orders o LEFT JOIN users u ON u.id = o.user_id
     ${where} ORDER BY o.id DESC LIMIT ?`,
    [...params, Math.min(opts.limit ?? 60, 200)],
  );
}
