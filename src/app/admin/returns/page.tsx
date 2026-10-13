import Link from 'next/link';
import { ensureDb } from '@/lib/bootstrap.ts';
import { listReturns, RETURN_STATUS_LABELS, returnPolicyStatus } from '@/domain/returns.ts';
import { Panel, Table } from '@/components/admin/panel.tsx';
import { Badge, ReviewBadge, SampleBadge } from '@/components/ui/badge.tsx';
import { ActionButton } from '@/components/admin/action-button.tsx';
import { FieldForm } from '@/components/admin/field-form.tsx';
import { formatMoney } from '@/domain/money.ts';

import { requireAdminPage } from '@/lib/session.ts';
ensureDb();
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Returns' };

type ReturnRow = {
  id: number;
  reference: string;
  order_id: number;
  order_number: string;
  type: string;
  reason_code: string;
  reason_detail: string | null;
  status: string;
  refund_status: string;
  inspection_status: string;
  disposition: string | null;
  requested_refund_cents: number | null;
  approved_refund_cents: number | null;
  total_cents: number;
  currency: string;
  contact_email: string | null;
  created_at: string;
  decided_at: string | null;
  is_sample_order?: number;
};

const FILTERS = ['', 'requested', 'approved', 'pickup_scheduled', 'received', 'inspection_pending', 'refund_pending', 'refunded', 'closed', 'rejected'];

export default async function AdminReturnsPage({
  searchParams,
}
: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireAdminPage();
  const sp = await searchParams;
  const status = sp.status && FILTERS.includes(sp.status) ? sp.status : '';
  const policy = returnPolicyStatus();
  const rows = listReturns({ status: status || undefined, limit: 120 }) as unknown as ReturnRow[];

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Post-purchase</p>
          <h1 className="font-display text-[27px] leading-tight">Returns, exchanges &amp; refunds</h1>
        </div>
        <Link href="/admin/settings" className="btn-outline py-2 text-[11.5px]">
          Policy settings
        </Link>
      </header>

      {!policy.publishable ? (
        <div className="flex flex-wrap items-start gap-3 border border-alert-warn/35 bg-alert-warn/5 px-4 py-3 text-[12.5px] leading-relaxed text-ink-600">
          <ReviewBadge label="Policy not publishable" />
          <p className="min-w-[240px] flex-1">
            {policy.enabled
              ? 'Returns are switched on but the window or the owner approval is missing, so the storefront is telling customers “not configured yet”. Set the window in settings before you promise a turnaround here.'
              : 'The returns policy is switched off, so no new requests can be raised by customers. Requests already on file can still be worked.'}{' '}
            Approval, inspection and refund decisions below are recorded against your user id.
          </p>
        </div>
      ) : null}

      <nav aria-label="Filter returns" className="-mx-1 flex gap-1 overflow-x-auto scroll-x px-1 pb-1">
        {FILTERS.map((f) => (
          <Link
            key={f || 'all'}
            href={f ? `/admin/returns?status=${f}` : '/admin/returns'}
            className={`whitespace-nowrap rounded-xs border px-2.5 py-1 text-[11.5px] uppercase tracking-widest transition ${
              status === f ? 'border-ink bg-ink text-ivory-100' : 'border-stone-300 bg-white text-ink-500 hover:border-ink-300'
            }`}
          >
            {f ? RETURN_STATUS_LABELS[f] ?? f : 'All'}
          </Link>
        ))}
      </nav>

      <Panel title={`${rows.length} request${rows.length === 1 ? '' : 's'}`}>
        {rows.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-ink-600">Nothing in this queue.</p>
        ) : (
          <ul className="space-y-4">
            {rows.map((r) => {
              const open = ['requested', 'under_review'].includes(r.status);
              const awaitingInspection = ['received', 'inspection_pending'].includes(r.status);
              return (
                <li key={r.id} className="border border-stone-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[12.5px] font-medium">{r.reference}</span>
                        <Badge tone={r.status === 'closed' || r.status === 'refunded' ? 'ok' : r.status === 'rejected' || r.status === 'cancelled' ? 'error' : 'warn'}>
                          {RETURN_STATUS_LABELS[r.status] ?? r.status}
                        </Badge>
                        <Badge tone="outline">{r.type}</Badge>
                        <Badge tone={r.inspection_status === 'passed' ? 'ok' : r.inspection_status === 'failed' ? 'error' : 'neutral'}>
                          inspection: {r.inspection_status}
                        </Badge>
                      </p>
                      <p className="mt-1.5 text-[12.5px] text-ink-600">
                        <Link href={`/admin/orders/${r.order_id}`} className="underline underline-offset-4">
                          {r.order_number}
                        </Link>{' '}
                        · {r.contact_email ?? 'guest'} · raised {r.created_at.slice(0, 16).replace('T', ' ')} UTC
                        {r.decided_at ? ` · decided ${r.decided_at.slice(0, 10)}` : ''}
                      </p>
                      <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-ink-600">
                        <span className="font-medium">{r.reason_code.replace(/_/g, ' ')}</span>
                        {r.reason_detail ? ` — ${r.reason_detail}` : ''}
                      </p>
                      <p className="mt-1.5 text-[12px] text-ink-600">
                        Requested {r.requested_refund_cents != null ? formatMoney(r.requested_refund_cents, r.currency) : 'no refund'}
                        {r.approved_refund_cents != null ? ` · approved ${formatMoney(r.approved_refund_cents, r.currency)}` : ''}
                        {r.disposition ? ` · disposition ${r.disposition}` : ''}
                        {r.refund_status !== 'none' ? ` · refund ${r.refund_status}` : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-start gap-3">
                      {open ? (
                        <div className="w-[260px]">
                          <FieldForm
                            path={`/api/admin/returns/${r.id}`}
                            submitLabel="Approve request"
                            title="Decision"
                            fields={[
                              { name: 'action', type: 'hidden', value: 'approve' },
                              { name: 'note', label: 'Note for the customer (optional)', type: 'textarea', placeholder: 'Send the item to the return address within X days…' },
                            ]}
                          />
                          <ActionButton
                            small
                            tone="danger"
                            label="Reject"
                            confirm="Reject this request? The customer is told the reason."
                            path={`/api/admin/returns/${r.id}`}
                            body={{ action: 'reject' }}
                          />
                        </div>
                      ) : null}
                      {!open && r.status !== 'closed' && r.status !== 'refunded' ? (
                        <div className="flex flex-wrap gap-1.5">
                          {r.status === 'approved' ? (
                            <ActionButton small label="Pickup scheduled" path={`/api/admin/returns/${r.id}`} body={{ action: 'pickup_scheduled' }} />
                          ) : null}
                          {r.status === 'pickup_scheduled' ? (
                            <ActionButton small label="Mark in transit" path={`/api/admin/returns/${r.id}`} body={{ action: 'in_transit' }} />
                          ) : null}
                          {r.status === 'in_transit' ? <ActionButton small tone="solid" label="Mark received" path={`/api/admin/returns/${r.id}`} body={{ action: 'received' }} /> : null}
                          {awaitingInspection ? (
                            <>
                              <ActionButton small tone="solid" label="Inspection passed" path={`/api/admin/returns/${r.id}`} body={{ action: 'inspected_pass' }} />
                              <ActionButton small tone="danger" label="Failed inspection" path={`/api/admin/returns/${r.id}`} body={{ action: 'inspected_fail' }} />
                            </>
                          ) : null}
                          {r.status === 'refund_pending' ? (
                            <ActionButton
                              small
                              tone="solid"
                              label="Issue refund"
                              confirm="Issue the approved refund through the payment adapter?"
                              path={`/api/admin/returns/${r.id}`}
                              body={{ action: 'issue_refund' }}
                            />
                          ) : null}
                          {['inspected', 'rejected', 'closed'].includes(r.status) ? null : (
                            <ActionButton small label="Close" confirm="Close this request?" path={`/api/admin/returns/${r.id}`} body={{ action: 'close' }} />
                          )}
                        </div>
                      ) : null}
                      {['approved', 'received', 'inspection_pending', 'inspected'].includes(r.status) && r.approved_refund_cents == null ? (
                        <div className="w-[240px]">
                          <FieldForm
                            path={`/api/admin/returns/${r.id}`}
                            submitLabel="Approve refund amount"
                            title="Refund"
                            fields={[
                              { name: 'action', type: 'hidden', value: 'approve_refund' },
                              {
                                name: 'amountCents',
                                label: 'Amount (paise)',
                                type: 'number',
                                required: true,
                                hint: `Order total ${String(r.total_cents)} paise; requested ${r.requested_refund_cents == null ? 'nothing' : String(r.requested_refund_cents)}.`,
                              },
                            ]}
                            note="Approving an amount is what actually queues the money; the return stays open until the refund is issued."
                          />
                        </div>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <p className="text-[12px] leading-relaxed text-ink-600">
        Refund amounts above the configured policy limit, or on orders outside the return window, are refused by the
        domain layer — the buttons here only record what the rules already allow.
        {policy.returnShipping ? ` Return shipping policy: ${policy.returnShipping.replace(/_/g, ' ')}.` : ''}
      </p>
    </div>
  );
}
