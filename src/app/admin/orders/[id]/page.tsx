import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ensureDb } from '@/lib/bootstrap.ts';
import { get } from '@/db/client.ts';
import { orderSummary, humanStatus, canTransition, type OrderStatus } from '@/domain/orders.ts';
import { RETURN_STATUS_LABELS } from '@/domain/returns.ts';
import { Panel, Table } from '@/components/admin/panel.tsx';
import { Badge, SampleBadge } from '@/components/ui/badge.tsx';
import { ActionButton } from '@/components/admin/action-button.tsx';
import { FieldForm } from '@/components/admin/field-form.tsx';
import { formatMoney } from '@/domain/money.ts';

import { requireAdminPage } from '@/lib/session.ts';
ensureDb();
export const dynamic = 'force-dynamic';

const FLOW: OrderStatus[] = ['awaiting_fulfilment', 'packed', 'shipped', 'out_for_delivery', 'delivered'];

type Order = {
  id: number;
  order_number: string;
  status: string;
  payment_status: string;
  fulfilment_status: string;
  cancellation_status: string;
  refund_status: string;
  currency: string;
  subtotal_cents: number;
  discount_cents: number;
  shipping_cents: number;
  tax_cents: number;
  cod_fee_cents: number;
  total_cents: number;
  coupon_code: string | null;
  is_sample_order: number;
  contact_phone: string | null;
  guest_email: string | null;
  user_id: number | null;
  customer_note: string | null;
  internal_note: string | null;
  cancel_reason: string | null;
  created_at: string;
  placed_at: string | null;
  delivered_at: string | null;
};

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  await requireAdminPage('/admin/orders');
  const { id } = await params;
  const row = get<{ order_number: string }>('SELECT order_number FROM orders WHERE id = ?', [Number(id)]);
  if (!row) notFound();
  return { title: `Order ${row.order_number}` };
}

export default async function AdminOrderPage({ params }
: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const { id } = await params;
  const orderId = Number(id);
  if (!Number.isInteger(orderId) || orderId <= 0) notFound();
  const summary = orderSummary(orderId);
  if (!summary) notFound();
  const o = summary.order as unknown as Order;
  const money = (c: number) => formatMoney(c, o.currency);

  const next = FLOW.filter((s) => canTransition(o.status as OrderStatus, s));
  const cancellation = summary.returns.filter((r) => r.type === 'cancellation' && ['requested', 'under_review'].includes(String(r.status)));

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/admin/orders" className="text-[12px] uppercase tracking-widest text-ink-400 hover:text-ink">
            ← Orders
          </Link>
          <h1 className="mt-1 font-display text-[27px] leading-tight">{o.order_number}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-[12.5px] text-ink-400">
            placed {o.created_at.slice(0, 16).replace('T', ' ')} UTC
            {o.is_sample_order === 1 ? <SampleBadge label="Sample order — not real demand" /> : null}
            <Badge tone={o.payment_status === 'captured' ? 'ok' : o.payment_status === 'failed' ? 'error' : 'warn'}>
              Payment {o.payment_status}
            </Badge>
            <Badge tone="outline">{humanStatus(o.status)}</Badge>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {next.map((s) => (
            <ActionButton
              key={s}
              small
              tone={s === 'awaiting_fulfilment' || s === 'packed' ? 'quiet' : 'solid'}
              label={humanStatus(s)}
              path={`/api/admin/orders/${o.id}`}
              body={{ action: s, detail: `Set from admin order page` }}
            />
          ))}
          {o.status !== 'cancelled' && o.status !== 'refunded' ? (
            <ActionButton
              small
              tone="danger"
              label="Cancel order"
              confirm="Cancel this order? Stock is released and a refund is queued if it was paid."
              path={`/api/admin/orders/${o.id}`}
              body={{ action: 'cancelled', detail: 'Cancelled by staff' }}
            />
          ) : null}
        </div>
      </header>

      {o.is_sample_order === 1 ? (
        <p className="border border-sand-500/50 bg-sand-100/60 px-4 py-2.5 text-[12.5px] leading-relaxed text-ink-600">
          This order only contains sample catalogue records. Use it to rehearse picking and packing — do not ship it,
          and do not count it in demand reporting.
        </p>
      ) : null}

      {cancellation.length > 0 ? (
        <Panel title="Cancellation requested by customer" note={`Reason on file: ${cancellation.map((c) => String(c.reason_code)).join(', ')}`}>
          <div className="flex flex-wrap items-center gap-3">
            <ActionButton tone="solid" label="Approve cancellation" path={`/api/admin/orders/${o.id}`} body={{ action: 'resolve_cancellation', approve: true }} confirm="Approve? The order is cancelled and any payment is queued for refund." />
            <ActionButton tone="danger" label="Reject" path={`/api/admin/orders/${o.id}`} body={{ action: 'resolve_cancellation', approve: false }} confirm="Reject the cancellation request? The order stays in fulfilment." />
            <p className="text-[12px] text-ink-400">
              Approval follows the cancellation policy window configured in settings; the server decides, not this button.
            </p>
          </div>
        </Panel>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        <div className="space-y-4">
          <Panel title="Items">
            <Table head={['Item', 'SKU', 'Qty', 'Unit', 'Line total']}>
              {summary.lines.map((l) => (
                <tr key={String(l.id)}>
                  <td className="py-2.5 pr-4">
                    <Link href={`/product/${String(l.snapshot_slug)}`} className="underline-offset-4 hover:underline">
                      {String(l.snapshot_title)}
                    </Link>
                    <span className="mt-0.5 block text-[11.5px] text-ink-400">
                      {[l.snapshot_size, l.snapshot_color].filter(Boolean).join(' · ')}
                    </span>
                    {l.is_sample === 1 ? <span className="mt-1 inline-block"><SampleBadge /></span> : null}
                  </td>
                  <td className="py-2.5 pr-4 font-mono text-[11.5px] text-ink-500">{String(l.snapshot_sku)}</td>
                  <td className="py-2.5 pr-4 tabular-nums">{String(l.quantity)}</td>
                  <td className="py-2.5 pr-4 tabular-nums">{money(Number(l.unit_price_cents))}</td>
                  <td className="py-2.5 pr-4 tabular-nums">{money(Number(l.line_total_cents))}</td>
                </tr>
              ))}
            </Table>
            <dl className="mt-4 ml-auto w-full max-w-sm space-y-1 text-[13px]">
              {[
                ['Subtotal', o.subtotal_cents],
                ['Discount', -o.discount_cents],
                ['Shipping', o.shipping_cents],
                ['Tax', o.tax_cents],
                ['COD handling', o.cod_fee_cents],
              ].map(([k, v]) => (
                <div key={k as string} className="flex justify-between text-ink-500">
                  <dt>{k as string}</dt>
                  <dd className="tabular-nums">{money(Number(v))}</dd>
                </div>
              ))}
              <div className="flex justify-between border-t border-stone-300 pt-1 font-medium text-ink">
                <dt>Total</dt>
                <dd className="tabular-nums">{money(o.total_cents)}</dd>
              </div>
              {o.coupon_code ? (
                <p className="text-[11.5px] text-ink-400">Coupon {o.coupon_code}</p>
              ) : null}
            </dl>
          </Panel>

          <Panel title="Payment records" note="Only a verified provider webhook or a provider lookup can move an order to paid — the admin UI has no such button.">
            {summary.payments.length === 0 ? (
              <p className="py-3 text-[13px] text-ink-400">No payment attempt recorded.</p>
            ) : (
              <ul className="space-y-2 text-[13px]">
                {summary.payments.map((pm) => (
                  <li key={String(pm.id)} className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 pb-2 last:border-0">
                    <span className="flex items-center gap-2">
                      <Badge tone={pm.status === 'captured' ? 'ok' : pm.status === 'failed' ? 'error' : 'warn'}>{String(pm.status)}</Badge>
                      <span className="text-ink-500">
                        {String(pm.provider)} · {String(pm.provider_mode)} · {String(pm.method)}
                      </span>
                    </span>
                    <span className="tabular-nums">{money(Number(pm.amount_cents))}</span>
                    {pm.failure_message ? <span className="w-full text-[11.5px] text-alert-error">{String(pm.failure_message)}</span> : null}
                    {pm.verified_at ? <span className="w-full text-[11.5px] text-ink-400">verified {String(pm.verified_at).slice(0, 16).replace('T', ' ')} UTC</span> : null}
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 grid gap-4 border-t border-stone-200 pt-4 sm:grid-cols-2">
              <div>
                <p className="eyebrow mb-2">Check payment status</p>
                <ActionButton
                  small
                  label="Ask provider now"
                  path={`/api/payments/status?orderId=${o.id}`}
                  body={{}}
                />
                <p className="mt-1.5 text-[11.5px] leading-snug text-ink-400">
                  Re-verifies against the provider and captures the order if the payment is confirmed. Safe to repeat.
                </p>
              </div>
              <div>
                <p className="eyebrow mb-2">Refund</p>
                <FieldForm
                  path="/api/admin/refunds"
                  submitLabel="Queue refund"
                  fields={[
                    { name: 'orderId', type: 'hidden', value: o.id },
                    { name: 'amountCents', label: 'Amount (paise)', type: 'number', hint: `Captured total is ${String(o.total_cents)} paise. Partial refunds allowed.` },
                    { name: 'reason', label: 'Reason (required)' },
                  ]}
                  note="Refunds need a written reason. Issuing money may require the provider adapter."
                />
              </div>
            </div>
          </Panel>

          <Panel title="Shipping & tracking">
            {summary.shipments.length === 0 ? (
              <p className="py-2 text-[13px] text-ink-400">No shipment created yet.</p>
            ) : (
              <ul className="mb-4 space-y-2 text-[13px]">
                {summary.shipments.map((sh) => (
                  <li key={String(sh.id)} className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 pb-2 last:border-0">
                    <span className="flex items-center gap-2">
                      <Badge tone="outline">{String(sh.status)}</Badge>
                      <span className="font-mono text-[12px]">{String(sh.tracking_number ?? 'no reference')}</span>
                      <span className="text-ink-400">{String(sh.courier ?? '')} · {String(sh.provider)}/{String(sh.provider_mode)}</span>
                    </span>
                    {sh.estimated_delivery_date ? <span className="text-[12px] text-ink-500">ETA {String(sh.estimated_delivery_date)}</span> : null}
                  </li>
                ))}
              </ul>
            )}
            <FieldForm
              path="/api/admin/shipments"
              submitLabel="Save tracking reference"
              title="Enter courier details"
              fields={[
                { name: 'orderId', type: 'hidden', value: o.id },
                { name: 'action', type: 'hidden', value: 'manual_tracking' },
                { name: 'courier', label: 'Courier' },
                { name: 'trackingNumber', label: 'Tracking number', required: true },
              ]}
              note="Recorded in the audit log as a manual entry, so it can always be told apart from a courier-generated label."
            />
          </Panel>

          <Panel title="Timeline">
            <ol className="space-y-2">
              {summary.events.map((ev, i) => (
                <li key={i} className="flex flex-wrap items-baseline gap-2 border-b border-stone-200 pb-2 text-[12.5px] last:border-0">
                  <span className="font-medium text-ink">{humanStatus(String(ev.to_status ?? ev.event))}</span>
                  {ev.from_status ? <span className="text-ink-400">from {humanStatus(String(ev.from_status))}</span> : null}
                  <span className="text-ink-500">{String(ev.detail ?? '')}</span>
                  <span className="ml-auto whitespace-nowrap text-[11.5px] text-ink-400">{String(ev.created_at).slice(0, 16).replace('T', ' ')}</span>
                </li>
              ))}
              {summary.events.length === 0 ? <li className="py-2 text-[13px] text-ink-400">No events recorded.</li> : null}
            </ol>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="Customer">
            {summary.addresses.length === 0 ? (
              <p className="text-[13px] text-ink-400">No address snapshot — the order was not completed.</p>
            ) : null}
            <ul className="space-y-3">
              {summary.addresses.map((a, i) => (
                <li key={i} className="text-[13px] leading-relaxed text-ink-600">
                  <p className="eyebrow mb-1">{String(a.kind)}</p>
                  <address className="not-italic">
                    {String(a.recipient_name)}
                    <br />
                    {String(a.line1)}
                    {a.line2 ? (
                      <>
                        <br />
                        {String(a.line2)}
                      </>
                    ) : null}
                    <br />
                    {String(a.city)}, {String(a.state_name)} {String(a.pincode)}
                    <br />
                    {String(a.country_code)} · {String(a.phone)}
                  </address>
                </li>
              ))}
            </ul>
            <div className="mt-3 space-y-1 border-t border-stone-200 pt-3 text-[12.5px] text-ink-500">
              <p>Contact: {o.guest_email ?? (o.user_id ? `account #${o.user_id}` : '—')}</p>
              {o.contact_phone ? <p>Phone: {o.contact_phone}</p> : null}
              {o.user_id ? (
                <p>
                  Account: <Link href={`/admin/customers?q=${o.user_id}`} className="underline underline-offset-4">#{o.user_id}</Link>
                </p>
              ) : null}
            </div>
            {o.customer_note ? (
              <div className="mt-3 border-l-2 border-sand-500 pl-3 text-[12.5px] leading-relaxed text-ink-600">
                <p className="eyebrow mb-1">Customer note</p>
                {o.customer_note}
              </div>
            ) : null}
          </Panel>

          <Panel title="Internal note" note="Never shown to the customer.">
            <FieldForm
              path={`/api/admin/orders/${o.id}`}
              submitLabel="Save note"
              resetOnSuccess={false}
              fields={[
                { name: 'action', type: 'hidden', value: 'note' },
                { name: 'note', label: 'Note', type: 'textarea', value: o.internal_note ?? '', placeholder: 'Packing instructions, calls made, disputes…' },
              ]}
            />
          </Panel>

          <Panel title="Returns on this order">
            {summary.returns.length === 0 ? (
              <p className="py-2 text-[13px] text-ink-400">No returns, exchanges or cancellation requests.</p>
            ) : (
              <ul className="space-y-2 text-[12.5px]">
                {summary.returns.map((r) => (
                  <li key={String(r.id)} className="border-b border-stone-200 pb-2 last:border-0">
                    <Link href={`/admin/returns?q=${String(r.reference)}`} className="font-medium underline-offset-4 hover:underline">
                      {String(r.reference)}
                    </Link>
                    <span className="ml-2 text-ink-400">{String(r.type)}</span>
                    <span className="mt-1 flex items-center gap-2">
                      <Badge tone={String(r.status) === 'closed' ? 'ok' : 'warn'}>
                        {RETURN_STATUS_LABELS[String(r.status) as keyof typeof RETURN_STATUS_LABELS] ?? String(r.status)}
                      </Badge>
                      <span className="text-ink-400">refund {String(r.refund_status)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/admin/returns" className="mt-3 inline-block text-[12px] uppercase tracking-widest text-ink-500 hover:text-ink">
              Returns desk →
            </Link>
          </Panel>

          {summary.refunds.length > 0 ? (
            <Panel title="Refunds">
              <ul className="space-y-2 text-[12.5px]">
                {summary.refunds.map((rf) => (
                  <li key={String(rf.id)} className="flex items-center justify-between gap-2">
                    <Badge tone={rf.status === 'issued' ? 'ok' : rf.status === 'failed' ? 'error' : 'warn'}>{String(rf.status)}</Badge>
                    <span className="tabular-nums">{money(Number(rf.amount_cents))}</span>
                    <span className="ml-auto text-ink-400">{String(rf.created_at).slice(0, 10)}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
        </div>
      </div>
    </div>
  );
}
