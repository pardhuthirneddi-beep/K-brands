import crypto from 'node:crypto';
import { all, get, run, transaction } from '../db/client.ts';
import * as env from '../lib/env.ts';
import { AppError } from '../lib/errors.ts';
import { canonicalJson, hmacHex, timingSafeEqualStr } from '../lib/crypto-utils.ts';
import { recordAudit } from '../domain/audit.ts';
import { enqueueOrderPaid } from '../domain/order-hooks.ts';
import { canTransition } from '../domain/orders-state.ts';
import { STATUS_LABELS, type OrderStatus } from '../domain/orders.ts';

/**
 * Provider-neutral payment adapter.
 *
 * No gateway is selected by this project. The store therefore ships with:
 *   - `none`       → live payments impossible, checkout explains why (default).
 *   - `mock_sandbox` → deterministic test double used by the automated suite
 *                     and by staging walkthroughs. It is *clearly labelled* in
 *                     the DB (`provider_mode = 'mock'`) and in the UI.
 *
 * A real provider is added by implementing `PaymentAdapter` in one file and
 * registering it in `ADAPTERS`; nothing in the order flow changes.
 */

export type PaymentIntent = {
  orderId: number;
  orderNumber: string;
  amountCents: number;
  currency: string;
  providerPaymentId: string;
  mode: 'mock' | 'sandbox' | 'live';
  /** Only present for mock/sandbox flows — a fake confirmation handle. */
  testHandle?: string;
};

export type VerifiedPayment = {
  providerPaymentId: string;
  amountCents: number;
  currency: string;
  status: 'captured' | 'failed' | 'pending' | 'cancelled' | 'delayed';
  failureCode?: string;
  failureMessage?: string;
  method?: string;
  verifiedAt: string;
};

export type PaymentAdapter = {
  id: string;
  isLive: boolean;
  createIntent(input: { orderId: number; orderNumber: string; amountCents: number; currency: string }): PaymentIntent;
  verifyPayment(providerPaymentId: string): VerifiedPayment;
  refund(input: { paymentId: number; amountCents: number; currency: string; reason: string }): {
    providerRefundId: string;
    status: 'processing' | 'issued' | 'failed';
  };
  /** Returns the canonical event or throws; adapter decides how it authenticates. */
  parseWebhook(rawBody: string, headers: Record<string, string>): WebhookEvent;
};

export type WebhookEvent = {
  provider: string;
  providerEventId: string;
  eventType: string;
  providerPaymentId: string | null;
  orderNumber: string | null;
  amountCents: number | null;
  currency: string | null;
  status: VerifiedPayment['status'] | 'refund_issued';
  signatureValid: boolean;
  payload: Record<string, unknown>;
};

/* ------------------------------------------------------------ mock adapter */

const mockStatusKey = (providerPaymentId: string) => `mock:${providerPaymentId}`;

export const mockAdapter: PaymentAdapter = {
  id: 'mock_sandbox',
  isLive: false,
  createIntent({ orderId, orderNumber, amountCents, currency }) {
    const providerPaymentId = `mockpay_${crypto.randomBytes(8).toString('hex')}`;
    // Deterministic scenario control for automated tests only.
    const scenario = process.env.KBRANDS_MOCK_PAYMENT_SCENARIO ?? 'success';
    run(
      `INSERT OR REPLACE INTO settings (key, value_json, value_type, is_secret, requires_review, updated_at, source)
       VALUES (?, ?, 'string', 0, 0, ?, 'default')`,
      [mockStatusKey(providerPaymentId), JSON.stringify({ status: mapScenario(scenario), amountCents, currency, orderNumber }), new Date().toISOString()],
    );
    return {
      orderId,
      orderNumber,
      amountCents,
      currency,
      providerPaymentId,
      mode: 'mock',
      testHandle: scenario,
    };
  },
  verifyPayment(providerPaymentId) {
    const row = get<{ value_json: string }>('SELECT value_json FROM settings WHERE key = ?', [
      mockStatusKey(providerPaymentId),
    ]);
    if (!row) {
      return {
        providerPaymentId,
        amountCents: 0,
        currency: env.currency,
        status: 'failed',
        failureCode: 'unknown_payment',
        failureMessage: 'That payment reference is not recognised by the test gateway.',
        verifiedAt: new Date().toISOString(),
      };
    }
    const parsed = JSON.parse(row.value_json) as { status: VerifiedPayment['status']; amountCents: number; currency: string };
    return {
      providerPaymentId,
      amountCents: parsed.amountCents,
      currency: parsed.currency,
      status: parsed.status,
      failureCode: parsed.status === 'failed' ? 'insufficient_funds' : undefined,
      failureMessage: parsed.status === 'failed' ? 'The test gateway declined this payment.' : undefined,
      verifiedAt: new Date().toISOString(),
    };
  },
  refund({ paymentId, amountCents }) {
    const payment = get<{ status: string; amount_cents: number }>('SELECT status, amount_cents FROM payments WHERE id = ?', [
      paymentId,
    ]);
    if (!payment) return { providerRefundId: `mockrefund_none`, status: 'failed' };
    if (amountCents > payment.amount_cents) return { providerRefundId: 'mockrefund_over', status: 'failed' };
    return { providerRefundId: `mockrefund_${crypto.randomBytes(6).toString('hex')}`, status: 'issued' };
  },
  parseWebhook(rawBody, headers) {
    const signature = headers['x-kbrands-mock-signature'] ?? headers['x-signature'] ?? '';
    const expected = hmacHex(rawBody);
    const signatureValid = Boolean(signature) && timingSafeEqualStr(signature, expected);
    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      throw new AppError('validation_error', 'Webhook body was not valid JSON.', 400);
    }
    return {
      provider: 'mock_sandbox',
      providerEventId: String(payload.event_id ?? crypto.randomUUID()),
      eventType: String(payload.type ?? 'payment.unknown'),
      providerPaymentId: payload.payment_id ? String(payload.payment_id) : null,
      orderNumber: payload.order_number ? String(payload.order_number) : null,
      amountCents: payload.amount_cents == null ? null : Number(payload.amount_cents),
      currency: payload.currency ? String(payload.currency) : null,
      status: mapEventType(String(payload.type ?? '')),
      signatureValid,
      payload,
    };
  },
};

function mapScenario(s: string): VerifiedPayment['status'] {
  switch (s) {
    case 'fail':
    case 'failed':
      return 'failed';
    case 'pending':
    case 'delayed':
      return s === 'pending' ? 'pending' : 'delayed';
    case 'cancel':
    case 'cancelled':
      return 'cancelled';
    default:
      return 'captured';
  }
}

function mapEventType(type: string): WebhookEvent['status'] {
  if (type.includes('captured') || type.includes('succeeded')) return 'captured';
  if (type.includes('failed') || type.includes('declined')) return 'failed';
  if (type.includes('pending') || type.includes('delayed')) return 'pending';
  if (type.includes('cancelled')) return 'cancelled';
  if (type.includes('refunded') || type.includes('refund.')) return 'refund_issued' as never;
  return 'pending';
}

export const ADAPTERS: Record<string, PaymentAdapter> = {
  none: {
    ...mockAdapter,
    id: 'none',
    isLive: false,
    createIntent() {
      throw new AppError(
        'payment_unavailable',
        'Online payment is not available yet. The store team has not connected a payment provider, so we cannot take your order with a card or UPI right now.',
        503,
      );
    },
  },
  mock_sandbox: mockAdapter,
};

export function activePaymentAdapter(): PaymentAdapter {
  const id = env.paymentProvider === 'none' ? (env.sandboxOrdersEnabled ? 'mock_sandbox' : 'none') : env.paymentProvider;
  const adapter = ADAPTERS[id];
  if (!adapter) {
    throw new AppError(
      'payment_unavailable',
      `The configured payment provider “${id}” is not implemented in this build.`,
      503,
    );
  }
  if (adapter.isLive && !env.liveCommerceEnabled) {
    throw new AppError('payment_unavailable', 'Live payments are disabled for this deployment.', 503);
  }
  return adapter;
}

export function paymentModeLabel(): { mode: 'live' | 'mock' | 'disabled'; label: string; detail: string } {
  if (env.livePaymentsAvailable) {
    return {
      mode: 'live',
      label: 'Live payments enabled',
      detail: `Provider ${env.paymentProvider}. Only use this once the provider account, KYC and webhook secret are confirmed.`,
    };
  }
  if (env.sandboxOrdersEnabled) {
    return {
      mode: 'mock',
      label: 'Sandbox testing mode',
      detail: 'No real money moves. Orders created here are test records and are marked as such.',
    };
  }
  return { mode: 'disabled', label: 'Payments disabled', detail: 'No payment provider is configured and sandbox ordering is off.' };
}

/* ------------------------------------------------------- flow operations */

export function startPayment(input: {
  orderId: number;
  orderNumber: string;
  amountCents: number;
  currency: string;
  useCod: boolean;
}): PaymentIntent | null {
  if (input.useCod) return null;
  const adapter = activePaymentAdapter();
  const intent = adapter.createIntent({
    orderId: input.orderId,
    orderNumber: input.orderNumber,
    amountCents: input.amountCents,
    currency: input.currency,
  });
  const ts = new Date().toISOString();
  const pending = get<{ id: number }>(
    `SELECT id FROM payments WHERE order_id = ? AND status = 'initiated' ORDER BY id DESC LIMIT 1`,
    [input.orderId],
  );
  if (pending) {
    run(
      `UPDATE payments SET provider = ?, provider_mode = ?, provider_payment_id = ?, status = 'pending', updated_at = ?
       WHERE id = ?`,
      [adapter.id, adapter.isLive ? 'live' : 'mock', intent.providerPaymentId, ts, pending.id],
    );
  } else {
    run(
      `INSERT INTO payments (order_id, provider, provider_mode, provider_payment_id, method, amount_cents, currency,
          status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'gateway', (SELECT total_cents FROM orders WHERE id = ?), (SELECT currency FROM orders WHERE id = ?),
               'pending', ?, ?)`,
      [input.orderId, adapter.id, adapter.isLive ? 'live' : 'mock', intent.providerPaymentId, input.orderId, input.orderId, ts, ts],
    );
  }
  run(
    `UPDATE orders SET status = 'awaiting_payment_confirmation', updated_at = ? WHERE id = ? AND status = 'pending_payment'`,
    [ts, input.orderId],
  );
  run(
    `INSERT INTO order_events (order_id, event, from_status, to_status, detail, created_at)
     SELECT ?, 'payment_intent_created', 'pending_payment', 'awaiting_payment_confirmation', ?, ?
     WHERE EXISTS (SELECT 1 FROM orders WHERE id = ? AND status = 'awaiting_payment_confirmation')`,
    [input.orderId, `provider=${adapter.id} ref=${intent.providerPaymentId}`, ts, input.orderId],
  );
  return intent;
}

/**
 * The ONLY path that marks an order paid. It is called from webhook handling and
 * from the server-side return-path check — never from a client redirect alone.
 * Verifies amount, currency and order association, and is idempotent.
 */
export function markPaidFromVerified(input: {
  orderId: number;
  providerPaymentId: string;
  amountCents: number;
  currency: string;
  verifiedVia: 'webhook' | 'server_lookup';
  actorLabel?: string;
}): { ok: boolean; alreadyPaid: boolean; reason?: string } {
  return transaction(() => {
    const order = get<{
      id: number;
      order_number: string;
      status: OrderStatus;
      total_cents: number;
      currency: string;
      payment_status: string;
    }>('SELECT id, order_number, status, total_cents, currency, payment_status FROM orders WHERE id = ?', [
      input.orderId,
    ]);
    if (!order) return { ok: false, alreadyPaid: false, reason: 'unknown_order' };
    if (order.payment_status === 'captured') {
      return { ok: true, alreadyPaid: true };
    }
    if (order.total_cents !== input.amountCents) {
      return { ok: false, alreadyPaid: false, reason: 'amount_mismatch' };
    }
    if (order.currency.toUpperCase() !== String(input.currency).toUpperCase()) {
      return { ok: false, alreadyPaid: false, reason: 'currency_mismatch' };
    }
    const ts = new Date().toISOString();
    run(
      `UPDATE payments SET status = 'captured', verified_at = ?, verification_source = ?, updated_at = ?
       WHERE order_id = ? AND (provider_payment_id = ? OR provider_payment_id IS NULL)`,
      [ts, input.verifiedVia, ts, order.id, input.providerPaymentId],
    );
    const nextStatus: OrderStatus = 'paid';
    if (canTransition(order.status, nextStatus)) {
      run("UPDATE orders SET status = 'paid', payment_status = 'captured', placed_at = COALESCE(placed_at, ?), updated_at = ? WHERE id = ?", [
        ts,
        ts,
        order.id,
      ]);
      run(
        `INSERT INTO order_events (order_id, event, from_status, to_status, detail, created_at)
         VALUES (?, 'payment_captured', ?, 'paid', ?, ?)`,
        [order.id, order.status, `${input.verifiedVia}:${input.providerPaymentId}`, ts],
      );
    } else {
      // e.g. order was cancelled while paying: keep the money recorded, flag for refund.
      run("UPDATE orders SET payment_status = 'captured', updated_at = ? WHERE id = ?", [ts, order.id]);
      run(
        `INSERT INTO order_events (order_id, event, from_status, to_status, detail, created_at)
         VALUES (?, 'payment_captured_after_terminal_state', ?, ?, 'refund required — order was no longer payable', ?)`,
        [order.id, order.status, order.status, ts],
      );
    }
    recordAudit({
      action: 'payment.captured',
      targetType: 'order',
      targetId: order.order_number,
      summary: `Payment verified via ${input.verifiedVia} for ${String(order.total_cents)} paise`,
    });
    enqueueOrderPaid(order.id, order.order_number);
    return { ok: true, alreadyPaid: false };
  });
}

export function recordPaymentFailure(input: {
  orderId: number;
  providerPaymentId: string;
  code?: string;
  message?: string;
}): void {
  transaction(() => {
    const order = get<{ id: number; order_number: string; status: OrderStatus }>(
      'SELECT id, order_number, status FROM orders WHERE id = ?',
      [input.orderId],
    );
    if (!order) return;
    const ts = new Date().toISOString();
    run(
      `UPDATE payments SET status = 'failed', failure_code = ?, failure_message = ?, updated_at = ?
       WHERE order_id = ? AND provider_payment_id = ?`,
      [input.code ?? 'declined', (input.message ?? 'Payment declined').slice(0, 200), ts, input.orderId, input.providerPaymentId],
    );
    if (canTransition(order.status, 'payment_failed')) {
      run("UPDATE orders SET status = 'payment_failed', payment_status = 'failed', updated_at = ? WHERE id = ?", [ts, input.orderId]);
      run(
        `INSERT INTO order_events (order_id, event, from_status, to_status, detail, created_at)
         VALUES (?, 'payment_failed', ?, 'payment_failed', ?, ?)`,
        [input.orderId, order.status, input.message ?? 'Payment declined', ts],
      );
    }
    recordAudit({
      action: 'payment.failed',
      targetType: 'order',
      targetId: order.order_number,
      summary: `Payment failed: ${input.code ?? 'declined'}`,
    });
  });
}

/**
 * Ingest a provider webhook with full idempotency. The raw event is stored
 * first (so replays are provably ignored), then applied inside a transaction.
 */
export function ingestWebhook(input: { provider: string; rawBody: string; headers: Record<string, string>; ip?: string | null }): {
  status: 'processed' | 'ignored_duplicate' | 'ignored_unverified' | 'failed' | 'mismatch';
  detail: string;
} {
  const adapter = ADAPTERS[input.provider];
  if (!adapter) return { status: 'ignored_unverified', detail: 'unknown provider' };
  let event: WebhookEvent;
  try {
    event = adapter.parseWebhook(input.rawBody, input.headers);
  } catch (err) {
    return { status: 'failed', detail: err instanceof Error ? err.message : 'parse error' };
  }
  const ts = new Date().toISOString();
  const payloadHash = crypto.createHash('sha256').update(canonicalJson(event.payload)).digest('hex');

  const stored = transaction(() => {
    // Dedupe only ever consults *authenticated* deliveries. If it also matched rows that
    // failed the signature check, anyone who could guess a provider event id could burn
    // that id ahead of time and permanently block the genuine confirmation — a cheap way
    // to stop paid orders from ever being released.
    const dupe = get<{ id: number; process_status: string }>(
      `SELECT id, process_status FROM payment_webhook_events
       WHERE provider = ? AND provider_event_id = ? AND signature_valid = 1`,
      [event.provider, event.providerEventId],
    );
    if (dupe) return { duplicate: true as const, row: dupe };
    // Rejected payloads are still recorded, under a throwaway key with the same prefix, so
    // the evidence survives without occupying the unique slot the real event needs.
    const storedEventId = event.signatureValid
      ? event.providerEventId
      : `${event.providerEventId}#unverified:${crypto.randomBytes(5).toString('hex')}`;
    const res = run(
      `INSERT INTO payment_webhook_events (provider, provider_event_id, event_type, payload_hash, payload_json,
          signature_valid, process_status, received_at)
       VALUES (?,?,?,?,?,?, 'received', ?)`,
      [
        event.provider,
        storedEventId,
        event.eventType,
        payloadHash,
        JSON.stringify(event.payload),
        event.signatureValid ? 1 : 0,
        ts,
      ],
    );
    return { duplicate: false as const, id: res.lastInsertRowid };
  });

  if (stored.duplicate) {
    return { status: 'ignored_duplicate', detail: `event already ${stored.row.process_status}` };
  }
  const webhookId = 'id' in stored ? stored.id : 0;

  if (!event.signatureValid) {
    run("UPDATE payment_webhook_events SET process_status = 'ignored_unverified', processed_at = ? WHERE id = ?", [ts, webhookId]);
    recordAudit({
      action: 'webhook.rejected_signature',
      targetType: 'payment_webhook',
      targetId: webhookId,
      summary: `Rejected ${event.eventType} from ${event.provider}: signature did not verify`,
      ip: input.ip,
    });
    return { status: 'ignored_unverified', detail: 'signature invalid' };
  }

  const order = event.orderNumber
    ? get<{ id: number; total_cents: number; currency: string }>('SELECT id, total_cents, currency FROM orders WHERE order_number = ?', [
        String(event.orderNumber).toUpperCase(),
      ])
    : event.providerPaymentId
      ? get<{ id: number; total_cents: number; currency: string }>(
          'SELECT o.id, o.total_cents, o.currency FROM orders o JOIN payments p ON p.order_id = o.id WHERE p.provider_payment_id = ?',
          [event.providerPaymentId],
        )
      : undefined;

  if (!order) {
    run("UPDATE payment_webhook_events SET process_status = 'failed', error = 'order not found', processed_at = ? WHERE id = ?", [
      ts,
      webhookId,
    ]);
    return { status: 'failed', detail: 'order not found' };
  }

  // Amount + currency must match the order, or we refuse to apply the event.
  if (event.amountCents != null && event.amountCents !== order.total_cents) {
    run(
      `UPDATE payment_webhook_events SET process_status = 'failed', error = 'amount mismatch', order_id = ?, processed_at = ? WHERE id = ?`,
      [order.id, ts, webhookId],
    );
    recordAudit({
      action: 'webhook.amount_mismatch',
      targetType: 'order',
      targetId: String(order.id),
      summary: `Webhook amount ${String(event.amountCents)} ≠ order total ${String(order.total_cents)}; not applied`,
    });
    return { status: 'mismatch', detail: 'amount mismatch' };
  }
  if (event.currency && event.currency.toUpperCase() !== order.currency.toUpperCase()) {
    run("UPDATE payment_webhook_events SET process_status = 'failed', error = 'currency mismatch', processed_at = ? WHERE id = ?", [ts, webhookId]);
    return { status: 'mismatch', detail: 'currency mismatch' };
  }

  run('UPDATE payment_webhook_events SET order_id = ? WHERE id = ?', [order.id, webhookId]);

  if (event.status === 'captured') {
    const res = markPaidFromVerified({
      orderId: order.id,
      providerPaymentId: event.providerPaymentId ?? 'unknown',
      amountCents: event.amountCents ?? order.total_cents,
      currency: event.currency ?? order.currency,
      verifiedVia: 'webhook',
    });
    run("UPDATE payment_webhook_events SET process_status = 'processed', processed_at = ? WHERE id = ?", [ts, webhookId]);
    return {
      status: 'processed',
      detail: res.alreadyPaid ? 'already paid (idempotent no-op)' : 'order marked paid',
    };
  }
  if (event.status === 'refund_issued') {
    run(
      `UPDATE refunds SET status = 'issued', issued_at = ?, updated_at = ? WHERE order_id = ? AND status IN ('requested','approved','processing')`,
      [ts, ts, order.id],
    );
    run("UPDATE payment_webhook_events SET process_status = 'processed', processed_at = ? WHERE id = ?", [ts, webhookId]);
    return { status: 'processed', detail: 'refund marked issued' };
  }
  if (event.status === 'failed') {
    recordPaymentFailure({
      orderId: order.id,
      providerPaymentId: event.providerPaymentId ?? 'unknown',
      code: 'provider_declined',
      message: 'Payment declined by the provider.',
    });
    run("UPDATE payment_webhook_events SET process_status = 'processed', processed_at = ? WHERE id = ?", [ts, webhookId]);
    return { status: 'processed', detail: 'payment marked failed' };
  }
  run("UPDATE payment_webhook_events SET process_status = 'processed', processed_at = ? WHERE id = ?", [ts, webhookId]);
  return { status: 'processed', detail: `recorded provider status “${event.status}” without changing the order` };
}

export function checkPendingPayment(orderId: number): { status: string; message: string } {
  const payments = all<{ id: number; provider: string; provider_payment_id: string | null; status: string }>(
    `SELECT id, provider, provider_payment_id, status FROM payments WHERE order_id = ? ORDER BY id DESC LIMIT 1`,
    [orderId],
  );
  const latest = payments[0];
  if (!latest) return { status: 'not_started', message: 'No payment has been started for this order.' };
  if (latest.status === 'captured') return { status: 'captured', message: 'Payment is confirmed.' };
  if (!latest.provider_payment_id) return { status: latest.status, message: 'Payment is still being confirmed.' };
  const adapter = ADAPTERS[latest.provider] ?? activePaymentAdapter();
  const verified = adapter.verifyPayment(latest.provider_payment_id);
  const order = get<{ order_number: string; total_cents: number; currency: string }>(
    'SELECT order_number, total_cents, currency FROM orders WHERE id = ?',
    [orderId],
  );
  if (!order) return { status: 'not_found', message: 'Order not found.' };
  if (verified.status === 'captured') {
    const res = markPaidFromVerified({
      orderId,
      providerPaymentId: verified.providerPaymentId,
      amountCents: verified.amountCents,
      currency: verified.currency,
      verifiedVia: 'server_lookup',
    });
    if (!res.ok) {
      return {
        status: 'mismatch',
        message:
          res.reason === 'amount_mismatch'
            ? 'The confirmed amount does not match this order, so it has not been marked paid.'
            : 'We could not attach that confirmation to this order.',
      };
    }
    return { status: 'captured', message: 'Payment confirmed and recorded.' };
  }
  if (verified.status === 'failed') {
    recordPaymentFailure({
      orderId,
      providerPaymentId: verified.providerPaymentId,
      code: verified.failureCode,
      message: verified.failureMessage,
    });
    return { status: 'failed', message: verified.failureMessage ?? 'The payment was not completed.' };
  }
  return {
    status: verified.status,
    message:
      verified.status === 'pending'
        ? 'Your bank is still confirming the payment. We will update the order automatically once the provider confirms — please do not pay twice.'
        : 'The payment was not completed. Your order has not been charged.',
  };
}

export function initiateRefund(input: {
  orderId: number;
  amountCents: number;
  reason: string;
  actorUserId: number;
  actorRole: string;
}): { refundId: number; status: string } {
  return transaction(() => {
    const payment = get<{ id: number; provider: string; status: string; amount_cents: number; currency: string }>(
      `SELECT id, provider, status, amount_cents, currency FROM payments WHERE order_id = ? AND status IN ('captured','authorized') ORDER BY id DESC LIMIT 1`,
      [input.orderId],
    );
    const order = get<{ order_number: string; total_cents: number }>('SELECT order_number, total_cents FROM orders WHERE id = ?', [
      input.orderId,
    ]);
    if (!order) throw new AppError('not_found', 'Order not found.', 404);
    if (!payment) {
      // Refunding an order with no captured payment must never mark money as returned.
      throw new AppError('state_conflict', 'No completed payment exists on this order, so there is nothing to refund.', 409);
    }
    if (input.amountCents <= 0 || input.amountCents > payment.amount_cents) {
      throw new AppError('validation_error', 'Refund amount must be between Re 0.01 and the captured amount.', 400);
    }
    const adapter = ADAPTERS[payment.provider] ?? activePaymentAdapter();
    const res = adapter.refund({
      paymentId: payment.id,
      amountCents: input.amountCents,
      currency: payment.currency,
      reason: input.reason,
    });
    const ts = new Date().toISOString();
    const insert = run(
      `INSERT INTO refunds (order_id, payment_id, provider, provider_refund_id, amount_cents, currency, status, reason,
          initiated_by, issued_at, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        input.orderId,
        payment.id,
        payment.provider,
        res.providerRefundId,
        input.amountCents,
        payment.currency,
        res.status === 'issued' ? 'issued' : 'processing',
        input.reason.slice(0, 300),
        input.actorUserId,
        res.status === 'issued' ? ts : null,
        ts,
        ts,
      ],
    );
    const totalRefunded =
      (get<{ n: number }>(
        "SELECT COALESCE(SUM(amount_cents), 0) AS n FROM refunds WHERE order_id = ? AND status IN ('issued','processing')",
        [input.orderId],
      )?.n ?? 0) + input.amountCents;
    const fully = totalRefunded >= order.total_cents;
    run(`UPDATE orders SET refund_status = 'issued', payment_status = ?, updated_at = ? WHERE id = ?`, [
      fully ? 'refunded' : 'partially_refunded',
      ts,
      input.orderId,
    ]);
    const currentStatus = get<{ status: OrderStatus }>('SELECT status FROM orders WHERE id = ?', [input.orderId]);
    if (currentStatus && canTransition(currentStatus.status, fully ? 'refunded' : 'partially_refunded')) {
      run('UPDATE orders SET status = ? WHERE id = ?', [fully ? 'refunded' : 'partially_refunded', input.orderId]);
    }
    run(
      `INSERT INTO order_events (order_id, event, from_status, to_status, actor_user_id, detail, created_at)
       VALUES (?, 'refund_recorded', ?, ?, ?, ?, ?)`,
      [
        input.orderId,
        currentStatus?.status ?? 'paid',
        currentStatus?.status ?? 'paid',
        input.actorUserId,
        `Refund of ${String(input.amountCents)} paise ${res.status} (${STATUS_LABELS[fully ? 'refunded' : 'partially_refunded']})`,
        ts,
      ],
    );
    recordAudit({
      action: 'refund.create',
      targetType: 'order',
      targetId: order.order_number,
      actorUserId: input.actorUserId,
      actorRole: input.actorRole,
      summary: `Refund ${String(input.amountCents)} paise ${res.status} via ${payment.provider}`,
    });
    return { refundId: insert.lastInsertRowid, status: res.status };
  });
}

export function webhookSignaturePreview(rawBody: string): string {
  return hmacHex(rawBody);
}
