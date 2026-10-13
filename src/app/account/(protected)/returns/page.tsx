import Link from 'next/link';
import { ensureDb } from '@/lib/bootstrap.ts';
import { requireUser } from '@/lib/session.ts';
import { returnsForUser, returnPolicyStatus } from '@/domain/returns.ts';
import { RETURN_STATUS_LABELS } from '@/domain/returns.ts';
import { Badge, ReviewBadge } from '@/components/ui/badge.tsx';
import { EmptyState } from '@/components/ui/states.tsx';

ensureDb();
export const dynamic = 'force-dynamic';

export default async function ReturnsPage() {
  // requireUser, not readUser: the layout check alone is not enough under streaming, and a
  // non-null assertion here would turn a signed-out visitor into a crash rather than a redirect.
  const user = await requireUser('/account/returns');
  const rows = (await returnsForUser(user.id)) as {
    id: number;
    reference: string;
    order_number: string;
    type: string;
    reason_code: string;
    status: string;
    refund_status: string;
    inspection_status: string;
    created_at: string;
    decided_at: string | null;
  }[];
  const policy = returnPolicyStatus();

  return (
    <div className="space-y-7">
      <header>
        <h1 className="display-section text-[26px]">Returns &amp; requests</h1>
        <p className="mt-2 max-w-prose text-[13.5px] leading-relaxed text-ink-500">
          Every request is reviewed before anything happens to your money. A request on its own never issues a refund.
        </p>
      </header>

      {!policy.publishable ? (
        <div className="border border-dashed border-sand-500/60 bg-sand-100/60 px-4 py-3 text-[12.5px] leading-relaxed text-ink-600">
          <ReviewBadge label="Return policy not yet approved" />
          <p className="mt-2">
            This store has not published a return window or refund timeline, so requests are recorded for manual review
            and no timeframe is promised.{' '}
            <Link href="/policies/returns" className="underline underline-offset-4">
              What this means
            </Link>
          </p>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          title="No requests yet"
          body="Cancellations, returns and exchanges you raise from an order page will be listed here with their status."
          action={{ href: '/account/orders', label: 'Go to your orders' }}
        />
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="card p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-display text-[17px]">
                    <code className="text-[15px]">{r.reference}</code>
                  </p>
                  <p className="mt-0.5 text-[12.5px] text-ink-600">
                    For order{' '}
                    <Link href={`/order/${r.order_number}`} className="text-ink underline underline-offset-4">
                      {r.order_number}
                    </Link>{' '}
                    · {r.type} · {r.reason_code.replace(/_/g, ' ')}
                  </p>
                </div>
                <div className="text-right text-[12px] text-ink-600">
                  Raised {new Date(r.created_at).toLocaleDateString('en-IN', { dateStyle: 'medium' })}
                  {r.decided_at ? (
                    <br />
                  ) : null}
                  {r.decided_at ? `Reviewed ${new Date(r.decided_at).toLocaleDateString('en-IN', { dateStyle: 'medium' })}` : null}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge tone={r.status === 'refunded' ? 'ok' : r.status === 'rejected' ? 'error' : 'neutral'}>
                  {RETURN_STATUS_LABELS[r.status] ?? r.status.replace(/_/g, ' ')}
                </Badge>
                <Badge tone="outline">refund: {r.refund_status.replace(/_/g, ' ')}</Badge>
                <Badge tone="outline">inspection: {r.inspection_status.replace(/_/g, ' ')}</Badge>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
