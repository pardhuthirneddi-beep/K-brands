import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ensureDb } from '@/lib/bootstrap.ts';
import { get, all } from '@/db/client.ts';
import { readUser } from '@/lib/session.ts';
import { isAdmin } from '@/domain/auth.ts';
import { formatMoney } from '@/domain/money.ts';
import { humanStatus } from '@/domain/orders.ts';
import { Badge } from '@/components/ui/badge.tsx';
import { OrderActions } from '@/components/account/order-actions.tsx';
import { PaymentStatusPanel } from '@/components/account/payment-status.tsx';
import { eligibilityForOrder } from '@/domain/returns.ts';
import { trackingForOrder } from '@/adapters/shipping.ts';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import crypto from 'node:crypto';
import { timingSafeEqualStr } from '@/lib/crypto-utils.ts';
import * as env from '@/lib/env.ts';
import { consume } from '@/lib/rate-limit.ts';

ensureDb();
export const dynamic = 'force-dynamic';

/*
 * Guest orders: the order number is the only thing a guest holds, and our numbers are
 * time-structured (KB + yymmddHHmmss + sequence), so "know the number" is not a privacy
 * boundary. A guest view therefore shows status, items and totals — the money they care about —
 * and withholds the delivery address, phone and contact email until the email on the order is
 * confirmed here. Signed-in orders need none of this: object-level ownership is already checked.
 */
const ORDER_VIEW_COOKIE = 'kb_order_view';
const VIEW_TTL_SECONDS = 60 * 60 * 3;

function normaliseEmail(value: string): string {
  return value.trim().toLowerCase();
}

function viewProof(orderId: number, email: string, issuedAt: number): string {
  return crypto
    .createHash('sha256')
    .update(`kbrands-order-view|${String(orderId)}|${email}|${String(issuedAt)}|${env.requireServerCryptoSecret()}`)
    .digest('hex')
    .slice(0, 32);
}

/**
 * Confirm the email on a guest order. The answer is never echoed into the URL — a wrong one
 * returns to the same page with a flag, and a right one sets a short-lived signed cookie that this
 * page reads. Middleware already rejects cross-origin POSTs, which is what makes a server action
 * acceptable here without its own token.
 */
export async function confirmOrderEmail(formData: FormData) {
  'use server';
  const orderNumber = String(formData.get('order_number') ?? '').trim().toUpperCase().slice(0, 24);
  const email = normaliseEmail(String(formData.get('email') ?? ''));
  const budget = consume('order_verify', orderNumber || 'unknown');
  if (!budget.ok) {
    redirect(`/order/${encodeURIComponent(orderNumber)}?verify=slow`);
  }
  const order = get<{ id: number; order_number: string; user_id: number | null; guest_email: string | null }>(
    'SELECT id, order_number, user_id, guest_email FROM orders WHERE order_number = ?',
    [orderNumber],
  );
  if (!order) notFound();
  if (email.length > 0 && order.user_id === null && order.guest_email && normaliseEmail(order.guest_email) === email) {
    const issuedAt = Date.now();
    const jar = await cookies();
    // Do not lose email verification in the embedded HTTPS demo: its cookie, like the session and
    // CSRF cookies, has to be partitioned. Outside that sandbox it keeps the normal Lax policy.
    const forwardedProto = (await headers()).get('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase();
    const secure = (forwardedProto ?? (process.env.NODE_ENV === 'production' ? 'https' : 'http')) === 'https';
    const partitioned = env.previewEmbedEnabled && secure;
    jar.set(ORDER_VIEW_COOKIE, `${String(order.id)}.${String(issuedAt)}.${viewProof(order.id, email, issuedAt)}`, {
      httpOnly: true,
      sameSite: partitioned ? 'none' : 'lax',
      secure,
      partitioned,
      path: '/',
      maxAge: VIEW_TTL_SECONDS,
    });
    redirect(`/order/${encodeURIComponent(order.order_number)}`);
  }
  redirect(`/order/${encodeURIComponent(order.order_number)}?verify=failed`);
}

/**
 * The order lookup and the object-level authorization check happen here on purpose:
 * resolving it before the response streams is what makes someone else's order number
 * a plain 404 with no body, instead of a shell that has to be re-rendered away.
 */
export async function generateMetadata({ params }: { params: Promise<{ number: string }> }): Promise<Metadata> {
  const { number } = await params;
  const orderNumber = decodeURIComponent(number).trim().toUpperCase();
  const row = get<{ user_id: number | null }>('SELECT user_id FROM orders WHERE order_number = ?', [orderNumber]);
  if (!row) return { title: 'Order not found', robots: { index: false, follow: false } };
  const user = await readUser();
  if (row.user_id !== null && row.user_id !== user?.id && !isAdmin(user)) {
    // Not "your" order: render the not-found page (below) and make sure nothing about
    // the real order is ever flushed. 403 with a body would confirm it exists.
    notFound();
  }
  return { title: `Order ${orderNumber}`, robots: { index: false, follow: false } };
}

export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ number: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { number } = await params;
  const orderNumber = decodeURIComponent(number).trim().toUpperCase();
  const order = get<Record<string, unknown>>(
    `SELECT o.*, COALESCE(u.email, o.guest_email) AS contact_email FROM orders o LEFT JOIN users u ON u.id = o.user_id
     WHERE o.order_number = ?`,
    [orderNumber],
  ) as
    | {
        id: number;
        order_number: string;
        status: string;
        payment_status: string;
        total_cents: number;
        subtotal_cents: number;
        discount_cents: number;
        shipping_cents: number;
        tax_cents: number;
        cod_fee_cents: number;
        coupon_code: string | null;
        currency: string;
        created_at: string;
        placed_at: string | null;
        is_sample_order: number;
        user_id: number | null;
        contact_email: string | null;
      }
    | undefined;
  if (!order) notFound();

  const user = await readUser();
  // Object-level authorization: a guest link works, but a signed-in customer may
  // not read someone else's order by editing the URL.
  if (user && order.user_id !== null && order.user_id !== user.id) notFound();
  if (!user && order.user_id !== null) notFound();

  /*
   * A guest holding only the order number may see status, lines and totals. The delivery address,
   * phone and contact email stay withheld until the email on the order is confirmed, because order
   * numbers are time-structured and therefore guessable. See confirmOrderEmail above.
   */
  const query = await searchParams;
  const verifyFailed = String(query.verify ?? '') === 'failed';
  const verifyThrottled = String(query.verify ?? '') === 'slow';
  const isGuestOrder = order.user_id === null;
  const [claimId, claimIssuedAt, claimHash] = ((await cookies()).get(ORDER_VIEW_COOKIE)?.value ?? '').split('.');
  const contactConfirmed =
    !isGuestOrder ||
    (Number(claimId) === order.id &&
      Date.now() - Number(claimIssuedAt) < VIEW_TTL_SECONDS * 1000 &&
      claimHash !== undefined &&
      timingSafeEqualStr(claimHash, viewProof(order.id, normaliseEmail(order.contact_email ?? ''), Number(claimIssuedAt))));

  const lines = all<Record<string, unknown>>('SELECT * FROM order_lines WHERE order_id = ? ORDER BY id', [order.id]) as {
    snapshot_title: string;
    snapshot_size: string | null;
    snapshot_color: string | null;
    snapshot_sku: string;
    snapshot_image_url: string | null;
    snapshot_slug: string;
    quantity: number;
    unit_price_cents: number;
    line_total_cents: number;
    is_sample: number;
  }[];
  const address = get<Record<string, string | null>>('SELECT * FROM shipping_addresses WHERE order_id = ? AND kind = ?', [
    order.id,
    'shipping',
  ]) as {
    recipient_name: string;
    phone: string;
    line1: string;
    line2: string | null;
    locality: string | null;
    city: string;
    state_name: string;
    pincode: string;
    country_code: string;
  } | undefined;
  const events = all<{ event: string; detail: string | null; created_at: string }>(
    'SELECT event, detail, created_at FROM order_events WHERE order_id = ? ORDER BY id DESC LIMIT 12',
    [order.id],
  );
  const payment = get<{ status: string; provider: string; provider_mode: string; method: string; failure_message: string | null }>(
    'SELECT status, provider, provider_mode, method, failure_message FROM payments WHERE order_id = ? ORDER BY id DESC LIMIT 1',
    [order.id],
  );
  /*
   * The receipt has to say what the transport actually did. `KBRANDS_EMAIL_MODE=none` is the default,
   * so "confirmation sent to you@example.com" would be a claim about an email nobody sent — the
   * notification row is the only honest source here.
   */
  const emailNotice = get<{ status: string | null }>(
    `SELECT status FROM notifications
     WHERE related_type = 'order' AND related_id = ? AND template IN ('order_created','order_paid')
     ORDER BY id DESC LIMIT 1`,
    [String(order.id)],
  );
  const emailCopy = !contactConfirmed
    ? ''
    : emailNotice?.status === 'sent'
      ? ` · confirmation sent to ${order.contact_email}`
      : emailNotice?.status === 'queued' || emailNotice?.status === 'retrying'
        ? ` · confirmation for ${order.contact_email} is queued, but this deployment has no email transport (KBRANDS_EMAIL_MODE=${env.emailMode}), so it has not actually left the server. Keep this page.`
        : ` · no confirmation email was sent (email transport: KBRANDS_EMAIL_MODE=${env.emailMode}). Keep this page for your records.`;
  const tracking = trackingForOrder(order.id);
  const eligibility = eligibilityForOrder(order.id);
  const returns = all<{ reference: string; status: string; type: string; created_at: string }>(
    'SELECT reference, status, type, created_at FROM returns WHERE order_id = ? ORDER BY id DESC',
    [order.id],
  );

  return (
    <div className="container py-10 lg:py-14">
      <header className="border-b border-stone-200 pb-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Order {order.order_number}</p>
            <h1 className="display-section mt-2">
              {order.status === 'pending_payment' || order.status === 'awaiting_payment_confirmation'
                ? 'Thank you — your order is placed'
                : humanStatus(order.status)}
            </h1>
            <p className="mt-2 text-[13.5px] text-ink-500">
              Placed {new Date(order.placed_at ?? order.created_at).toLocaleDateString('en-IN', { dateStyle: 'long' })}
              {emailCopy}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {order.is_sample_order === 1 ? <Badge tone="sample">Contains sample records</Badge> : null}
            <Badge tone={order.payment_status === 'captured' ? 'ok' : order.payment_status === 'unpaid' ? 'warn' : 'neutral'}>
              {order.payment_status === 'captured' ? 'Payment confirmed' : `Payment ${order.payment_status.replace(/_/g, ' ')}`}
            </Badge>
            <Badge tone="outline">{humanStatus(order.status)}</Badge>
          </div>
        </div>
      </header>

      <div className="mt-8 grid gap-10 lg:grid-cols-[1.35fr_0.65fr]">
        <div className="space-y-8">
          <PaymentStatusPanel
            orderId={order.id}
            orderNumber={order.order_number}
            status={order.status}
            paymentStatus={order.payment_status}
            provider={payment?.provider ?? null}
            providerMode={payment?.provider_mode ?? null}
            method={payment?.method ?? null}
            failureMessage={payment?.failure_message ?? null}
            amountCents={order.total_cents}
            currency={order.currency}
          />

          <section>
            <h2 className="eyebrow mb-3">Items</h2>
            <ul className="divide-y divide-stone-200 border-y border-stone-200">
              {lines.map((l, i) => (
                <li key={i} className="flex gap-4 py-4">
                  <span className="product-frame block h-[92px] w-[70px] shrink-0 overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={l.snapshot_image_url ?? `/media/sample/${l.snapshot_slug}/0.svg`}
                      alt={`${l.snapshot_title} thumbnail`}
                      width={900}
                      height={1200}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-[16px] leading-snug">{l.snapshot_title}</p>
                    <p className="mt-0.5 text-[12.5px] text-ink-600">
                      {[l.snapshot_size, l.snapshot_color].filter(Boolean).join(' · ') || 'One size'} · Qty {l.quantity}
                    </p>
                    <p className="text-[11.5px] uppercase tracking-widest text-stone-500">{l.snapshot_sku}</p>
                    {l.is_sample === 1 ? (
                      <p className="mt-1 text-[11.5px] text-ink-600">Sample record — kept for testing the order flow.</p>
                    ) : null}
                  </div>
                  <p className="shrink-0 text-right text-[13.5px] tabular-nums">{formatMoney(l.line_total_cents, order.currency)}</p>
                </li>
              ))}
            </ul>
          </section>

          {tracking ? (
            <section className="card p-5">
              <h2 className="eyebrow mb-2">Tracking</h2>
              <p className="text-[13.5px]">
                <span className="capitalize">{tracking.status.replace(/_/g, ' ')}</span>
                {tracking.courier ? ` · ${tracking.courier}` : ''}
              </p>
              {tracking.tracking_number ? (
                <p className="mt-1 text-[12.5px] text-ink-600">
                  Reference <code className="rounded-xs bg-stone-100 px-1.5 py-0.5">{tracking.tracking_number}</code>
                  {tracking.isMock ? (
                    <span className="ml-2 text-alert-warn">test reference — not a live courier number</span>
                  ) : null}
                </p>
              ) : null}
              {tracking.publicNote ? (
                <p className="mt-2 border border-dashed border-sand-500/60 bg-sand-100/60 px-3 py-2 text-[12px] leading-relaxed text-ink-600">
                  {tracking.publicNote}
                </p>
              ) : null}
              {tracking.estimated_delivery_date ? (
                <p className="mt-2 text-[12.5px] text-ink-600">
                  Courier estimate: {new Date(tracking.estimated_delivery_date).toLocaleDateString('en-IN', { dateStyle: 'medium' })}
                </p>
              ) : (
                <p className="mt-2 text-[12.5px] text-ink-600">No delivery estimate has been published for this shipment.</p>
              )}
              {tracking.events.length > 0 ? (
                <ol className="mt-3 space-y-1.5 border-t border-stone-200 pt-3 text-[12.5px] text-ink-600">
                  {tracking.events.map((ev, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-stone-500">{new Date(ev.observed_at).toLocaleDateString('en-IN', { dateStyle: 'medium' })}</span>
                      <span className="capitalize">{ev.status.replace(/_/g, ' ')}</span>
                      {ev.location ? <span className="text-ink-600">· {ev.location}</span> : null}
                    </li>
                  ))}
                </ol>
              ) : null}
            </section>
          ) : null}

          {returns.length > 0 ? (
            <section>
              <h2 className="eyebrow mb-3">Requests on this order</h2>
              <ul className="space-y-2">
                {returns.map((r) => (
                  <li key={r.reference} className="flex flex-wrap items-center justify-between gap-2 border border-stone-200 bg-white/60 px-4 py-2.5 text-[13px]">
                    <span>
                      <code className="text-[12px]">{r.reference}</code> · {r.type} ·{' '}
                      <span className="capitalize">{r.status.replace(/_/g, ' ')}</span>
                    </span>
                    <span className="text-[12px] text-ink-600">{new Date(r.created_at).toLocaleDateString('en-IN')}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <OrderActions
            orderNumber={order.order_number}
            status={order.status}
            canRequestReturn={eligibility.eligible}
            returnReason={eligibility.reason}
            signedIn={Boolean(user)}
          />
        </div>

        <aside className="space-y-4">
          <div className="card p-5">
            <h2 className="eyebrow mb-3">Payment</h2>
            <dl className="space-y-1.5 text-[13px]">
              <Sum label="Subtotal" value={order.subtotal_cents} currency={order.currency} />
              {order.discount_cents > 0 ? (
                <Sum label={order.coupon_code ? `Discount ${order.coupon_code}` : 'Discount'} value={-order.discount_cents} currency={order.currency} />
              ) : null}
              <Sum label="Delivery" value={order.shipping_cents} currency={order.currency} />
              {order.tax_cents > 0 ? <Sum label="Tax" value={order.tax_cents} currency={order.currency} /> : null}
              {order.cod_fee_cents > 0 ? <Sum label="COD handling" value={order.cod_fee_cents} currency={order.currency} /> : null}
              <div className="flex justify-between border-t border-stone-200 pt-2.5 text-[15px] font-medium">
                <dt>Total</dt>
                <dd className="tabular-nums">{formatMoney(order.total_cents, order.currency)}</dd>
              </div>
            </dl>
          </div>
          {address && contactConfirmed ? (
            <div className="card p-5">
              <h2 className="eyebrow mb-2">Delivering to</h2>
              <address className="text-[13px] not-italic leading-relaxed text-ink-600">
                {address.recipient_name}
                <br />
                {address.line1}
                {address.line2 ? <>, {address.line2}</> : null}
                {address.locality ? <br /> : null}
                {address.locality ? `${address.locality}, ` : ''}
                {address.city}, {address.state_name} {address.pincode}
                <br />
                {address.country_code === 'IN' ? 'India' : address.country_code}
                <br />
                <span className="text-ink-600">{address.phone}</span>
              </address>
            </div>
          ) : null}
          {isGuestOrder && !contactConfirmed ? (
            <div className="card p-5">
              <h2 className="eyebrow mb-2">Confirm it is your order</h2>
              <p className="text-[13px] leading-relaxed text-ink-600">
                The delivery address stays hidden on a guest order until you confirm the email
                address it was placed with. Signed-in customers see it automatically.
              </p>
              <p
                role="status"
                className={`mt-3 text-[13px] ${verifyFailed || verifyThrottled ? 'text-alert-error' : 'hidden'}`}
              >
                {verifyFailed ? 'That email does not match the one on this order.' : ''}
                {verifyThrottled ? 'Too many attempts for this order. Try again in a few minutes.' : ''}
              </p>
              <form action={confirmOrderEmail} method="post" className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input type="hidden" name="order_number" value={order.order_number} />
                <label className="sr-only" htmlFor="order-email">
                  Email used for this order
                </label>
                <input
                  id="order-email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  inputMode="email"
                  placeholder="you@example.com"
                  className="field min-w-0 flex-1"
                />
                <button type="submit" className="btn-outline shrink-0 px-4">
                  Show address
                </button>
              </form>
            </div>
          ) : null}
          {events.length > 0 ? (
            <div className="card p-5">
              <h2 className="eyebrow mb-2">Progress</h2>
              <ol className="space-y-2 text-[12.5px] leading-relaxed text-ink-500">
                {events.map((ev, i) => (
                  <li key={i}>
                    <span className="block text-ink-600">{ev.event.replace(/_/g, ' ')}</span>
                    <span className="text-[11.5px] text-stone-500">
                      {new Date(ev.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                      {ev.detail ? ` · ${ev.detail}` : ''}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
          <div className="text-[13px]">
            {user ? (
              <Link href="/account/orders" className="link-underline">All my orders</Link>
            ) : (
              <Link href="/account/login?next=/account/orders" className="link-underline">
                Create an account to track this order anytime
              </Link>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function Sum({ label, value, currency }: { label: string; value: number; currency: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-ink-500">{label}</dt>
      <dd className="tabular-nums">{formatMoney(value, currency)}</dd>
    </div>
  );
}
