import { NextResponse } from 'next/server';
import { handler, ipHashFrom } from '@/lib/api.ts';
import { readUser } from '@/lib/session.ts';
import { AppError } from '@/lib/errors.ts';
import { get } from '@/db/client.ts';
import { checkPendingPayment } from '@/adapters/payment.ts';
import { consume } from '@/lib/rate-limit.ts';
import { ensureDb } from '@/lib/bootstrap.ts';
import { isAdmin } from '@/domain/auth.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Server-side payment re-check.
 *
 * The browser never marks an order paid: this route asks the provider (or the test
 * adapter) and records the outcome only if the provider confirms it, which keeps a
 * refreshed tab, a lost redirect or a retried webhook from creating a false "paid".
 *
 * Authorization mirrors the guest order link: an order attached to an account can
 * only be read by that account (or staff); a guest order can be checked by whoever
 * holds the order id, and reveals nothing beyond its own payment state.
 */
async function authorize(req: Request): Promise<number> {
  const url = new URL(req.url);
  const orderId = Number(url.searchParams.get('orderId'));
  if (!Number.isInteger(orderId) || orderId <= 0) throw new AppError('validation_error', 'Unknown order.', 400);
  const order = get<{ id: number; user_id: number | null }>('SELECT id, user_id FROM orders WHERE id = ?', [orderId]);
  if (!order) throw new AppError('not_found', 'Order not found.', 404);
  const user = await readUser();
  if (user && isAdmin(user)) return orderId;
  if (order.user_id !== null && order.user_id !== user?.id) {
    throw new AppError('forbidden', 'Sign in with the account that placed this order.', 403);
  }
  if (order.user_id !== null && !user) throw new AppError('forbidden', 'Sign in to check this payment.', 403);
  const ip = ipHashFrom(req);
  const limit = consume('payment_check', ip);
  if (!limit.ok) throw new AppError('rate_limited', 'Too many status checks. Try again shortly.', 429);
  return orderId;
}

export async function POST(req: Request) {
  ensureDb();
  return handler(req, {
    method: 'POST',
    run: async () => {
      const orderId = await authorize(req);
      const res = checkPendingPayment(orderId);
      return NextResponse.json({ ok: true, ...res });
    },
  });
}

/** Read-only snapshot used by the order page on load. */
export async function GET(req: Request) {
  ensureDb();
  return handler(req, {
    method: 'GET',
    run: async () => {
      const orderId = await authorize(req);
      const order = get<{ payment_status: string; status: string }>('SELECT payment_status, status FROM orders WHERE id = ?', [orderId]);
      if (!order) throw new AppError('not_found', 'Order not found.', 404);
      return NextResponse.json({ ok: true, paymentStatus: order.payment_status, status: order.status });
    },
  });
}
