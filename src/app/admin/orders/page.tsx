import Link from 'next/link';
import { ensureDb } from '@/lib/bootstrap.ts';
import { all, get } from '@/db/client.ts';
import { STATUS_LABELS, humanStatus, type OrderStatus } from '@/domain/orders.ts';
import { Panel, Table } from '@/components/admin/panel.tsx';
import { Badge, SampleBadge } from '@/components/ui/badge.tsx';
import { formatMoney } from '@/domain/money.ts';

import { requireAdminPage } from '@/lib/session.ts';
ensureDb();
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Orders' };

const PAGE = 25;

type AdminOrderRow = {
  id: number;
  order_number: string;
  status: string;
  payment_status: string;
  fulfilment_status: string;
  cancellation_status: string;
  refund_status: string;
  total_cents: number;
  currency: string;
  created_at: string;
  is_sample_order: number;
  internal_note: string | null;
  email: string | null;
  customer: string;
  contact_phone: string | null;
};

const FILTERS: { value: string; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'action', label: 'Needs action' },
  ...(Object.keys(STATUS_LABELS) as OrderStatus[]).map((k) => ({ value: k, label: humanStatus(k) })),
];

export default async function AdminOrdersPage({
  searchParams,
}
: {
  searchParams: Promise<{ status?: string; q?: string; page?: string }>;
}) {
  await requireAdminPage();
  const sp = await searchParams;
  const status = sp.status ?? '';
  const q = (sp.q ?? '').trim().slice(0, 80);
  const page = Math.max(1, Number(sp.page ?? 1) || 1);

  const where: string[] = [];
  const params: (string | number)[] = [];
  if (status === 'action') where.push("(o.status IN ('pending_payment','awaiting_payment_confirmation','awaiting_fulfilment','packed','cancellation_requested','returns_requested') OR o.payment_status = 'failed')");
  else if (status) {
    where.push('o.status = ?');
    params.push(status);
  }
  if (q) {
    where.push('(o.order_number LIKE ? OR COALESCE(u.email, o.guest_email) LIKE ? OR o.contact_phone LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  const clause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const total = get<{ n: number }>(`SELECT COUNT(*) AS n FROM orders o LEFT JOIN users u ON u.id = o.user_id ${clause}`, params)?.n ?? 0;
  const rows = all<AdminOrderRow>(
    `SELECT o.id, o.order_number, o.status, o.payment_status, o.fulfilment_status, o.cancellation_status, o.refund_status,
            o.subtotal_cents, o.shipping_cents, o.tax_cents, o.discount_cents, o.total_cents, o.currency,
            o.created_at, o.placed_at, o.is_sample_order, o.internal_note,
            COALESCE(u.email, o.guest_email) AS email, COALESCE(u.full_name, 'Guest') AS customer, o.contact_phone
     FROM orders o LEFT JOIN users u ON u.id = o.user_id
     ${clause}
     ORDER BY o.id DESC LIMIT ? OFFSET ?`,
    [...params, PAGE, (page - 1) * PAGE],
  );
  const pages = Math.max(1, Math.ceil(total / PAGE));

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Fulfilment</p>
          <h1 className="font-display text-[27px] leading-tight">Orders</h1>
        </div>
        <p className="text-[12.5px] text-ink-400">
          {total.toLocaleString('en-IN')} order{total === 1 ? '' : 's'} · page {page} of {pages}
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <form method="GET" className="flex flex-1 items-center gap-2" action="/admin/orders">
          {status ? <input type="hidden" name="status" value={status} /> : null}
          <label className="sr-only" htmlFor="q">
            Search orders
          </label>
          <input id="q" name="q" defaultValue={q} placeholder="Order number, email or phone" className="field max-w-[300px]" />
          <button type="submit" className="btn-outline py-2 text-[11.5px]">
            Search
          </button>
        </form>
      </div>

      <nav aria-label="Filter by status" className="-mx-1 flex gap-1 overflow-x-auto scroll-x px-1 pb-1">
        {FILTERS.map((f) => (
          <Link
            key={f.value || 'all'}
            href={f.value ? `/admin/orders?status=${f.value}${q ? `&q=${encodeURIComponent(q)}` : ''}` : `/admin/orders${q ? `?q=${encodeURIComponent(q)}` : ''}`}
            className={`whitespace-nowrap rounded-xs border px-2.5 py-1 text-[11.5px] transition ${
              status === f.value ? 'border-ink bg-ink text-ivory-100' : 'border-stone-300 bg-white text-ink-500 hover:border-ink-300'
            }`}
          >
            {f.label}
          </Link>
        ))}
      </nav>

      <Panel title={`Orders (${total.toLocaleString('en-IN')})`}>
        {rows.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-ink-400">No orders match this filter.</p>
        ) : (
          <Table head={['Order', 'Customer', 'Items value', 'Status', 'Payment', 'Fulfilment', 'Placed']}>
            {rows.map((o) => (
              <tr key={o.id as number} className="align-top">
                <td className="py-2.5 pr-4">
                  <Link href={`/admin/orders/${o.id}`} className="font-medium underline-offset-4 hover:underline">
                    {o.order_number}
                  </Link>
                  {o.is_sample_order === 1 ? (
                    <span className="mt-1 block">
                      <SampleBadge />
                    </span>
                  ) : null}
                  {o.internal_note ? <span className="mt-1 block max-w-[200px] truncate text-[11.5px] text-ink-400">{o.internal_note}</span> : null}
                </td>
                <td className="max-w-[200px] py-2.5 pr-4 text-[12.5px] text-ink-500">
                  <span className="block truncate">{o.customer}</span>
                  <span className="block truncate text-[11.5px]">{o.email}</span>
                </td>
                <td className="py-2.5 pr-4 tabular-nums">{formatMoney(o.total_cents, o.currency as string)}</td>
                <td className="py-2.5 pr-4">
                  <Badge tone={o.status === 'cancelled' ? 'error' : ['delivered', 'returned', 'refunded'].includes(o.status) ? 'ok' : 'neutral'}>
                    {humanStatus(o.status)}
                  </Badge>
                  {o.cancellation_status !== 'none' ? (
                    <span className="mt-1 block text-[11.5px] text-alert-warn">Cancellation {o.cancellation_status}</span>
                  ) : null}
                </td>
                <td className="py-2.5 pr-4">
                  <Badge tone={o.payment_status === 'captured' ? 'ok' : o.payment_status === 'failed' ? 'error' : 'warn'}>{o.payment_status}</Badge>
                </td>
                <td className="py-2.5 pr-4 text-[12px] text-ink-500">{o.fulfilment_status}</td>
                <td className="whitespace-nowrap py-2.5 pr-4 text-[12px] text-ink-400">{String(o.created_at).slice(0, 16).replace('T', ' ')}</td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>

      {pages > 1 ? (
        <nav aria-label="Pagination" className="flex items-center justify-between text-[12.5px]">
          <Link
            href={page > 1 ? `/admin/orders?page=${page - 1}&status=${status}&q=${encodeURIComponent(q)}` : '#'}
            className={page > 1 ? 'btn-outline py-1.5 text-[11.5px]' : 'pointer-events-none btn-outline py-1.5 text-[11.5px] opacity-40'}
          >
            Previous
          </Link>
          <span className="text-ink-400">
            Page {page} / {pages}
          </span>
          <Link
            href={page < pages ? `/admin/orders?page=${page + 1}&status=${status}&q=${encodeURIComponent(q)}` : '#'}
            className={page < pages ? 'btn-outline py-1.5 text-[11.5px]' : 'pointer-events-none btn-outline py-1.5 text-[11.5px] opacity-40'}
          >
            Next
          </Link>
        </nav>
      ) : null}
    </div>
  );
}
