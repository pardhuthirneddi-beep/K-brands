import Link from 'next/link';
import { ensureDb } from '@/lib/bootstrap.ts';
import { all, get } from '@/db/client.ts';
import { Panel, Table } from '@/components/admin/panel.tsx';
import { Badge } from '@/components/ui/badge.tsx';
import { formatMoney } from '@/domain/money.ts';

import { requireAdminPage } from '@/lib/session.ts';
ensureDb();
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Customers' };

type Row = {
  id: number;
  email: string;
  full_name: string;
  phone: string | null;
  role: string;
  status: string;
  created_at: string;
  last_login_at: string | null;
  email_verified_at: string | null;
  orders: number;
  spend_cents: number;
  sample_orders: number;
  open_returns: number;
};

export default async function AdminCustomersPage({ searchParams }
: { searchParams: Promise<{ q?: string }> }) {
  await requireAdminPage();
  const sp = await searchParams;
  const q = (sp.q ?? '').trim().slice(0, 80);
  const total = get<{ n: number }>('SELECT COUNT(*) AS n FROM users')?.n ?? 0;
  const rows = (
    q
      ? all<Row>(
          `SELECT u.id, u.email, u.full_name, u.phone, u.role, u.status, u.created_at, u.last_login_at, u.email_verified_at,
                  (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id) AS orders,
                  (SELECT COALESCE(SUM(o.total_cents),0) FROM orders o WHERE o.user_id = u.id AND o.payment_status = 'captured') AS spend_cents,
                  (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id AND o.is_sample_order = 1) AS sample_orders,
                  (SELECT COUNT(*) FROM returns r WHERE r.customer_id = u.id AND r.status NOT IN ('closed','refunded','rejected','cancelled')) AS open_returns
           FROM users u
           WHERE u.email LIKE ? OR u.full_name LIKE ? OR u.phone LIKE ?
           ORDER BY u.id DESC LIMIT 100`,
          [`%${q}%`, `%${q}%`, `%${q}%`],
        )
      : all<Row>(
          `SELECT u.id, u.email, u.full_name, u.phone, u.role, u.status, u.created_at, u.last_login_at, u.email_verified_at,
                  (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id) AS orders,
                  (SELECT COALESCE(SUM(o.total_cents),0) FROM orders o WHERE o.user_id = u.id AND o.payment_status = 'captured') AS spend_cents,
                  (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id AND o.is_sample_order = 1) AS sample_orders,
                  (SELECT COUNT(*) FROM returns r WHERE r.customer_id = u.id AND r.status NOT IN ('closed','refunded','rejected','cancelled')) AS open_returns
           FROM users u ORDER BY u.id DESC LIMIT 100`,
        )
  );

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">People</p>
          <h1 className="font-display text-[27px] leading-tight">Customers</h1>
          <p className="mt-1 text-[12.5px] text-ink-600">{total.toLocaleString('en-IN')} accounts · guest orders are listed under Orders, not here</p>
        </div>
        <form method="GET" className="flex items-center gap-2" action="/admin/customers">
          <label className="sr-only" htmlFor="q">Search customers</label>
          <input id="q" name="q" defaultValue={q} placeholder="Email, name or phone" className="field max-w-[240px]" />
          <button type="submit" className="btn-outline py-2 text-[11.5px]">Search</button>
        </form>
      </header>

      <Panel title={`${rows.length} account${rows.length === 1 ? '' : 's'}`} note="Addresses and passwords are never listed here. Password changes and account deletion are self-service, and both revoke every session.">
        {rows.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-ink-600">No accounts match that search.</p>
        ) : (
          <Table head={['Account', 'Contact', 'Role', 'Orders', 'Captured spend', 'Open returns', 'Last seen']}>
            {rows.map((u) => (
              <tr key={u.id} className="align-top">
                <td className="py-2.5 pr-4">
                  <span className="block font-medium">#{u.id} {u.full_name || '(no name)'}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-2 text-[11.5px] text-ink-600">
                    joined {u.created_at.slice(0, 10)}
                    <Badge tone={u.email_verified_at ? 'ok' : 'neutral'}>{u.email_verified_at ? 'email verified' : 'email unverified'}</Badge>
                    {u.status !== 'active' ? <Badge tone="error">{u.status}</Badge> : null}
                  </span>
                </td>
                <td className="py-2.5 pr-4 text-[12.5px] text-ink-600">
                  {u.email}
                  {u.phone ? <span className="block text-[11.5px] text-ink-600">{u.phone}</span> : null}
                </td>
                <td className="py-2.5 pr-4">
                  <Badge tone={u.role === 'admin' ? 'ink' : u.role === 'staff' ? 'outline' : 'neutral'}>{u.role}</Badge>
                </td>
                <td className="py-2.5 pr-4 tabular-nums">
                  <Link href={`/admin/orders?q=${encodeURIComponent(u.email)}`} className="underline underline-offset-4">
                    {u.orders}
                  </Link>
                  {u.sample_orders > 0 ? <span className="block text-[11.5px] text-ink-600">{u.sample_orders} sample</span> : null}
                </td>
                <td className="py-2.5 pr-4 tabular-nums">{formatMoney(u.spend_cents, 'INR')}</td>
                <td className="py-2.5 pr-4">
                  {u.open_returns > 0 ? <Badge tone="warn">{u.open_returns} open</Badge> : <span className="text-ink-600">—</span>}
                </td>
                <td className="whitespace-nowrap py-2.5 pr-4 text-[12px] text-ink-600">{u.last_login_at ? u.last_login_at.slice(0, 10) : 'never'}</td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>
    </div>
  );
}
