import Link from 'next/link';
import { ensureDb } from '@/lib/bootstrap.ts';
import { requireUser } from '@/lib/session.ts';
import { listOrdersForUser } from '@/domain/orders.ts';
import { formatMoney } from '@/domain/money.ts';
import { humanStatus } from '@/domain/orders.ts';
import { Badge } from '@/components/ui/badge.tsx';
import { EmptyState } from '@/components/ui/states.tsx';

ensureDb();
export const dynamic = 'force-dynamic';

export default async function OrdersPage() {
  // requireUser, not readUser: the layout check alone is not enough under streaming, and a
  // non-null assertion here would turn a signed-out visitor into a crash rather than a redirect.
  const user = await requireUser('/account/orders');
  const orders = listOrdersForUser(user.id, 60) as {
    id: number;
    order_number: string;
    status: string;
    payment_status: string;
    fulfilment_status: string;
    total_cents: number;
    currency: string;
    created_at: string;
    is_sample_order: number;
    line_count: number;
  }[];
  if (orders.length === 0) {
    return (
      <EmptyState
        title="No orders yet"
        body="Orders you place will be listed here with their payment, delivery and return status."
        action={{ href: '/shop', label: 'Start shopping' }}
      />
    );
  }
  return (
    <div>
      <h1 className="display-section mb-5 text-[26px]">Order history</h1>
      <ul className="space-y-3">
        {orders.map((o) => (
          <li key={o.id} className="card p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <Link href={`/order/${o.order_number}`} className="font-display text-[18px] hover:underline">
                  {o.order_number}
                </Link>
                <p className="mt-0.5 text-[12.5px] text-ink-400">
                  {new Date(o.created_at).toLocaleDateString('en-IN', { dateStyle: 'long' })} · {o.line_count}{' '}
                  {o.line_count === 1 ? 'item' : 'items'}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[15px] tabular-nums">{formatMoney(o.total_cents, o.currency)}</p>
                <p className="text-[12px] tracking-label text-ink-400">{o.currency}</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge tone={o.status.includes('cancel') || o.status === 'payment_failed' ? 'error' : o.status === 'delivered' ? 'ok' : 'neutral'}>
                {humanStatus(o.status)}
              </Badge>
              <Badge tone={o.payment_status === 'captured' ? 'ok' : 'outline'}>
                {o.payment_status === 'captured' ? 'Paid' : `Payment ${o.payment_status}`}
              </Badge>
              <Badge tone="outline">{o.fulfilment_status.replace(/_/g, ' ')}</Badge>
              {o.is_sample_order === 1 ? <Badge tone="sample">Test order</Badge> : null}
              <Link href={`/order/${o.order_number}`} className="ml-auto text-[12px] tracking-label text-ink-500 underline-offset-4 hover:underline">
                Track &amp; manage
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
