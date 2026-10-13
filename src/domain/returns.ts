import crypto from 'node:crypto';
import { all, get, run, transaction } from '../db/client.ts';
import * as env from '../lib/env.ts';
import { AppError } from '../lib/errors.ts';
import { recordAudit } from './audit.ts';
import { enqueueNotification } from './notifications.ts';
import { getSetting, requiresReview } from './settings.ts';
import { canTransition, type OrderStatus } from './orders-state.ts';
import { restock } from './inventory.ts';

/**
 * Returns, exchanges and cancellation — the technical foundations only.
 *
 * The policy itself is undecided. Therefore:
 *  - eligibility reads `returns.*` settings; when the window is unset the
 *    customer-facing action is refused with an honest "not configured" message,
 *    never an invented number of days;
 *  - a return request NEVER creates a refund. Inspection → approval →
 *    disposition → refund are separate, separately-permitted steps;
 *  - refunds require an explicit admin action on an approved return.
 */

export type ReturnStatus =
  | 'requested'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'pickup_scheduled'
  | 'in_transit'
  | 'received'
  | 'inspection_pending'
  | 'inspected'
  | 'refund_pending'
  | 'refunded'
  | 'exchange_reserved'
  | 'exchange_shipped'
  | 'closed'
  | 'cancelled';

const RETURN_FLOW: Record<string, ReturnStatus[]> = {
  requested: ['under_review', 'approved', 'rejected', 'cancelled'],
  under_review: ['approved', 'rejected', 'cancelled'],
  approved: ['pickup_scheduled', 'received', 'rejected', 'closed'],
  pickup_scheduled: ['in_transit', 'received', 'cancelled'],
  in_transit: ['received', 'cancelled'],
  received: ['inspection_pending', 'inspected', 'closed'],
  inspection_pending: ['inspected', 'closed'],
  inspected: ['refund_pending', 'exchange_reserved', 'closed', 'rejected'],
  refund_pending: ['refunded', 'rejected'],
  exchange_reserved: ['exchange_shipped', 'cancelled'],
  exchange_shipped: ['closed'],
  rejected: ['closed'],
  refunded: ['closed'],
  closed: [],
  cancelled: [],
};

export const RETURN_STATUS_LABELS: Record<string, string> = {
  requested: 'Requested',
  under_review: 'Under review',
  approved: 'Approved',
  rejected: 'Declined',
  pickup_scheduled: 'Pickup scheduled',
  in_transit: 'On the way back to us',
  received: 'Received at our facility',
  inspection_pending: 'Awaiting inspection',
  inspected: 'Inspected',
  refund_pending: 'Refund approved, awaiting issue',
  refunded: 'Refunded',
  exchange_reserved: 'Replacement reserved',
  exchange_shipped: 'Replacement dispatched',
  closed: 'Closed',
  cancelled: 'Cancelled by customer',
};

export function assertReturnTransition(from: ReturnStatus, to: ReturnStatus): void {
  if (from === to) return;
  if (!(RETURN_FLOW[from] ?? []).includes(to)) {
    throw new AppError(
      'state_conflict',
      `A return in the “${RETURN_STATUS_LABELS[from] ?? from}” state cannot move to “${RETURN_STATUS_LABELS[to] ?? to}”.`,
      409,
    );
  }
}

export function returnPolicyStatus() {
  const enabled = getSetting<boolean>('returns.enabled', false);
  const windowDays = getSetting<number | null>('returns.window_days', null);
  const reviewPending = requiresReview('returns.window_days');
  return {
    enabled,
    windowDays,
    exchangeEnabled: getSetting<boolean>('returns.exchange_enabled', false),
    excludedCategories: getSetting<string[]>('returns.excluded_categories', []),
    refundTimelineDays: getSetting<number | null>('returns.refund_timeline_days', null),
    refundMethod: getSetting<string>('returns.refund_method', 'original_payment_mode'),
    returnShipping: getSetting<string>('returns.return_shipping', 'customer_pays_unconfigured'),
    reviewPending,
    publishable: enabled && windowDays != null && !reviewPending,
  };
}

export function eligibilityForOrder(orderId: number): {
  eligible: boolean;
  reason: string | null;
  requiresConfiguration: boolean;
} {
  const policy = returnPolicyStatus();
  const order = get<{ status: OrderStatus; placed_at: string | null; created_at: string; payment_status: string }>(
    'SELECT status, placed_at, created_at, payment_status FROM orders WHERE id = ?',
    [orderId],
  );
  if (!order) return { eligible: false, reason: 'Order not found.', requiresConfiguration: false };
  if (!policy.enabled) {
    return {
      eligible: false,
      reason:
        'Returns are not yet enabled for this store. Please contact us using the details on our contact page once they are published.',
      requiresConfiguration: true,
    };
  }
  if (policy.windowDays == null) {
    return {
      eligible: false,
      reason: 'The return window for this store has not been approved yet, so we cannot accept an online return. Please contact us.',
      requiresConfiguration: true,
    };
  }
  if (['cancelled', 'refunded', 'returned', 'payment_failed', 'expired'].includes(order.status)) {
    return { eligible: false, reason: 'This order is not eligible for a return in its current state.', requiresConfiguration: false };
  }
  if (!['delivered', 'out_for_delivery', 'shipped', 'returns_requested', 'paid', 'awaiting_fulfilment', 'packed'].includes(order.status)) {
    return { eligible: false, reason: 'A return can only be requested once your order has been dispatched.', requiresConfiguration: false };
  }
  const anchor = order.placed_at ?? order.created_at;
  const daysElapsed = (Date.now() - new Date(anchor).getTime()) / 86_400_000;
  if (daysElapsed > policy.windowDays) {
    return {
      eligible: false,
      reason: `The approved return window for this store is ${String(policy.windowDays)} day(s) from order placement, and this order is outside it.`,
      requiresConfiguration: false,
    };
  }
  return { eligible: true, reason: null, requiresConfiguration: false };
}

export function createReturnRequest(input: {
  orderNumber: string;
  userId: number | null;
  orderLineId?: number | null;
  type: 'return' | 'exchange';
  reasonCode: string;
  detail?: string;
  ip?: string | null;
}): { reference: string; status: string; message: string } {
  return transaction(() => {
    const order = get<{ id: number; order_number: string; user_id: number | null }>(
      'SELECT id, order_number, user_id FROM orders WHERE order_number = ?',
      [input.orderNumber.trim().toUpperCase()],
    );
    if (!order) throw new AppError('not_found', 'We could not find that order.', 404);
    if (input.userId && order.user_id !== input.userId) {
      throw new AppError('not_found', 'We could not find that order.', 404);
    }
    const elig = eligibilityForOrder(order.id);
    if (!elig.eligible) throw new AppError('policy_not_configured', elig.reason ?? 'This order is not eligible.', 503);
    if (input.type === 'exchange' && !returnPolicyStatus().exchangeEnabled) {
      throw new AppError('policy_not_configured', 'Exchanges are not offered on this store yet. A return is available instead.', 503);
    }
    if (input.orderLineId) {
      const line = get<{ id: number }>('SELECT id FROM order_lines WHERE id = ? AND order_id = ?', [
        input.orderLineId,
        order.id,
      ]);
      if (!line) throw new AppError('validation_error', 'That line is not part of this order.', 400);
    }
    const reference = `KBRT-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const ts = new Date().toISOString();
    run(
      `INSERT INTO returns (reference, order_id, order_line_id, type, reason_code, reason_detail, status, requested_refund_cents,
          created_at, updated_at, customer_id)
       VALUES (?,?,?,?,?,?, 'requested', NULL, ?, ?, ?)`,
      [reference, order.id, input.orderLineId ?? null, input.type, input.reasonCode, (input.detail ?? '').slice(0, 800), ts, ts, input.userId],
    );
    run(
      `INSERT INTO order_events (order_id, event, to_status, actor_user_id, detail, created_at)
       VALUES (?, 'return_requested', 'returns_requested', ?, ?, ?)`,
      [order.id, input.userId, `${input.type} ${reference} (${input.reasonCode})`, ts],
    );
    if (canTransition('delivered' as OrderStatus, 'returns_requested')) {
      const cur = get<{ status: OrderStatus }>('SELECT status FROM orders WHERE id = ?', [order.id]);
      if (cur && canTransition(cur.status, 'returns_requested')) {
        run("UPDATE orders SET status = 'returns_requested', updated_at = ? WHERE id = ?", [ts, order.id]);
      }
    }
    recordAudit({
      action: 'return.create',
      targetType: 'order',
      targetId: order.order_number,
      actorUserId: input.userId,
      actorRole: 'customer',
      summary: `${input.type} request ${reference} submitted — no refund implied`,
      metadata: { reference, type: input.type, reason: input.reasonCode },
      ip: input.ip,
    });
    const email = get<{ email: string | null }>(
      'SELECT COALESCE(u.email, o.guest_email) AS email FROM orders o LEFT JOIN users u ON u.id = o.user_id WHERE o.id = ?',
      [order.id],
    )?.email;
    if (email) {
      enqueueNotification({
        template: 'return_requested',
        recipient: email,
        dedupeKey: `return_requested:${reference}`,
        subject: `K-brands: we received your request ${reference}`,
        bodyText: `Your ${input.type} request ${reference} for order ${order.order_number} is now with our team. A refund has not been issued and none is implied by this message.`,
        relatedType: 'return',
        relatedId: reference,
      });
    }
    return {
      reference,
      status: 'requested',
      message:
        'We have received your request. Our team will review it — no refund has been issued yet, and none is implied at this stage.',
    };
  });
}

export function decideReturn(
  returnId: number,
  decision: 'approve' | 'reject',
  actor: { userId: number; role: string },
  note?: string,
): void {
  transaction(() => {
    const ret = get<{ id: number; status: ReturnStatus; order_id: number; reference: string }>(
      'SELECT id, status, order_id, reference FROM returns WHERE id = ?',
      [returnId],
    );
    if (!ret) throw new AppError('not_found', 'Return not found.', 404);
    const to: ReturnStatus = decision === 'approve' ? 'approved' : 'rejected';
    assertReturnTransition(ret.status, to);
    const ts = new Date().toISOString();
    run("UPDATE returns SET status = ?, decided_by = ?, decided_at = ?, updated_at = ?, reason_detail = COALESCE(?, reason_detail) WHERE id = ?", [
      to,
      actor.userId,
      ts,
      ts,
      note ? note.slice(0, 800) : null,
      returnId,
    ]);
    recordAudit({
      action: `return.${decision}`,
      targetType: 'return',
      targetId: ret.reference,
      actorUserId: actor.userId,
      actorRole: actor.role,
      summary: `Return ${ret.reference} ${to}${note ? ` — ${note.slice(0, 120)}` : ''}`,
    });
    const email = get<{ email: string | null }>(
      'SELECT COALESCE(u.email, o.guest_email) AS email FROM orders o LEFT JOIN users u ON u.id = o.user_id WHERE o.id = ?',
      [ret.order_id],
    )?.email;
    if (email) {
      enqueueNotification({
        template: 'return_decision',
        recipient: email,
        dedupeKey: `return_decision:${ret.reference}:${to}`,
        subject: `K-brands: update on your request ${ret.reference}`,
        bodyText:
          decision === 'approve'
            ? `Your return ${ret.reference} has been approved. We will tell you how to send the items back once the return logistics are configured.`
            : `We have reviewed your request ${ret.reference} and could not approve it. Reason: ${note ?? 'please contact us for details.'}`,
        relatedType: 'return',
        relatedId: ret.reference,
      });
    }
  });
}

export function advanceReturn(
  returnId: number,
  step: 'received' | 'inspection_pending' | 'inspected_pass' | 'inspected_fail' | 'close' | 'pickup_scheduled' | 'in_transit',
  actor: { userId: number; role: string },
): { status: ReturnStatus } {
  return transaction(() => {
    const ret = get<{ id: number; status: ReturnStatus; reference: string; order_id: number; order_line_id: number | null }>(
      'SELECT id, status, reference, order_id, order_line_id FROM returns WHERE id = ?',
      [returnId],
    );
    if (!ret) throw new AppError('not_found', 'Return not found.', 404);
    const map: Record<typeof step, { to: ReturnStatus; inspection?: 'passed' | 'failed'; disposition?: 'restock' | 'hold' | 'scrap' }> = {
      pickup_scheduled: { to: 'pickup_scheduled' },
      in_transit: { to: 'in_transit' },
      received: { to: 'received' },
      inspection_pending: { to: 'inspection_pending' },
      inspected_pass: { to: 'inspected', inspection: 'passed', disposition: 'restock' },
      inspected_fail: { to: 'inspected', inspection: 'failed', disposition: 'hold' },
      close: { to: 'closed' },
    };
    const next = map[step];
    assertReturnTransition(ret.status, next.to);
    const ts = new Date().toISOString();
    run('UPDATE returns SET status = ?, inspection_status = COALESCE(?, inspection_status), disposition = COALESCE(?, disposition), updated_at = ? WHERE id = ?', [
      next.to,
      next.inspection ?? null,
      next.disposition ?? null,
      ts,
      returnId,
    ]);
    recordAudit({
      action: `return.${step}`,
      targetType: 'return',
      targetId: ret.reference,
      actorUserId: actor.userId,
      actorRole: actor.role,
      summary: `Return ${ret.reference} moved to ${next.to}`,
    });
    // Restock when inspection passed. A request that names a line restocks that line;
    // a whole-order request (no line) restocks every line on the order, because that is
    // what the customer meant — silently skipping it would leave the returned garments
    // out of stock forever while the returns desk believed they were back on the shelf.
    if (step === 'inspected_pass') {
      const lines = ret.order_line_id
        ? all<{ variant_id: number; quantity: number }>(
            'SELECT variant_id, quantity FROM order_lines WHERE id = ? AND variant_id IS NOT NULL',
            [ret.order_line_id],
          )
        : all<{ variant_id: number; quantity: number }>(
            'SELECT variant_id, quantity FROM order_lines WHERE order_id = ? AND variant_id IS NOT NULL',
            [ret.order_id],
          );
      for (const line of lines) {
        if (!line.variant_id) continue;
        restock(
          line.variant_id,
          line.quantity,
          'return',
          ret.reference,
          actor.userId,
          ret.order_line_id
            ? 'Returned item inspected and restocked'
            : 'Whole-order return inspected and restocked',
        );
      }
    }
    return { status: next.to };
  });
}

/**
 * Called once the provider has actually issued the money. Without this the request would
 * sit in “Refund approved, awaiting issue” forever — which is exactly the state the
 * dashboard counts as “open”, so refunds would look permanently outstanding.
 */
export function completeReturnRefund(
  returnId: number,
  actor: { userId: number; role: string },
): { status: ReturnStatus } {
  return transaction(() => {
    const ret = get<{ id: number; status: ReturnStatus; reference: string }>('SELECT id, status, reference FROM returns WHERE id = ?', [
      returnId,
    ]);
    if (!ret) throw new AppError('not_found', 'Return not found.', 404);
    if (ret.status === 'refunded' || ret.status === 'closed') return { status: ret.status };
    assertReturnTransition(ret.status, 'refunded');
    const ts = new Date().toISOString();
    run("UPDATE returns SET status = 'refunded', refund_status = 'issued', updated_at = ? WHERE id = ?", [ts, returnId]);
    recordAudit({
      action: 'return.refunded',
      targetType: 'return',
      targetId: ret.reference,
      actorUserId: actor.userId,
      actorRole: actor.role,
      summary: `Refund issued for return ${ret.reference}`,
    });
    enqueueNotification({
      template: 'refund_issued',
      recipient: notificationRecipientForReturn(returnId),
      subject: `Your refund for ${ret.reference} has been issued`,
      bodyText:
        `The refund of your order against return ${ret.reference} has been issued to the original payment method. ` +
        'Banks typically take 5–10 working days to show it.',
      dedupeKey: `return:${String(ret.reference)}:refunded`,
      relatedType: 'return',
      relatedId: String(returnId),
    });
    return { status: 'refunded' as const };
  });
}

function notificationRecipientForReturn(returnId: number): string {
  const row = get<{ email: string | null }>(
    `SELECT COALESCE(u.email, o.guest_email) AS email
     FROM returns r JOIN orders o ON o.id = r.order_id LEFT JOIN users u ON u.id = o.user_id
     WHERE r.id = ?`,
    [returnId],
  );
  return row?.email ?? 'unavailable@example.invalid';
}

export function approveRefundForReturn(
  returnId: number,
  amountCents: number,
  actor: { userId: number; role: string },
): { refundStatus: string } {
  return transaction(() => {
    const ret = get<{ id: number; status: ReturnStatus; order_id: number; reference: string; inspection_status: string }>(
      'SELECT id, status, order_id, reference, inspection_status FROM returns WHERE id = ?',
      [returnId],
    );
    if (!ret) throw new AppError('not_found', 'Return not found.', 404);
    if (ret.status !== 'inspected' && ret.status !== 'received' && ret.status !== 'approved') {
      throw new AppError('state_conflict', 'A refund can only be approved after the return has been reviewed.', 409);
    }
    if (ret.inspection_status === 'failed') {
      throw new AppError('state_conflict', 'This return failed inspection, so a refund cannot be approved against it.', 409);
    }
    if (amountCents <= 0) throw new AppError('validation_error', 'Refund amount must be positive.', 400);
    const order = get<{ total_cents: number }>('SELECT total_cents FROM orders WHERE id = ?', [ret.order_id]);
    if (!order || amountCents > order.total_cents) {
      throw new AppError('validation_error', 'The refund exceeds the amount paid for this order.', 400);
    }
    const ts = new Date().toISOString();
    run("UPDATE returns SET refund_status = 'approved', approved_refund_cents = ?, status = 'refund_pending', updated_at = ? WHERE id = ?", [
      amountCents,
      ts,
      returnId,
    ]);
    run("UPDATE orders SET refund_status = 'approved', updated_at = ? WHERE id = ?", [ts, ret.order_id]);
    recordAudit({
      action: 'return.refund_approved',
      targetType: 'return',
      targetId: ret.reference,
      actorUserId: actor.userId,
      actorRole: actor.role,
      summary: `Refund of ${String(amountCents)} paise approved for ${ret.reference} — awaiting payment-side execution`,
    });
    return { refundStatus: 'approved' };
  });
}

export function listReturns(opts: { status?: string; limit?: number } = {}) {
  const where = opts.status ? 'WHERE r.status = ?' : '';
  const params: (string | number)[] = opts.status ? [opts.status] : [];
  return all<Record<string, unknown>>(
    `SELECT r.*, o.order_number, o.total_cents, o.currency, COALESCE(u.email, o.guest_email) AS contact_email
     FROM returns r JOIN orders o ON o.id = r.order_id LEFT JOIN users u ON u.id = o.user_id
     ${where} ORDER BY r.id DESC LIMIT ?`,
    [...params, Math.min(opts.limit ?? 80, 300)],
  );
}

export function returnsForUser(userId: number) {
  return all<Record<string, unknown>>(
    `SELECT r.*, o.order_number FROM returns r JOIN orders o ON o.id = r.order_id
     WHERE o.user_id = ? OR r.customer_id = ? ORDER BY r.id DESC LIMIT 50`,
    [userId, userId],
  );
}
