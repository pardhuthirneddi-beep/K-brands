import Link from 'next/link';
import { ensureDb } from '@/lib/bootstrap.ts';
import { requireUser } from '@/lib/session.ts';
import { all, get } from '@/db/client.ts';
import { listAccountsForAdmin } from '@/domain/auth.ts';
import { formatMoney } from '@/domain/money.ts';
import { humanStatus } from '@/domain/orders.ts';
import { countItems } from '@/domain/cart.ts';

ensureDb();
export const dynamic = 'force-dynamic';

export default async function AccountOverview() {
  // requireUser, not readUser: the layout check alone is not enough under streaming, and a
  // non-null assertion here would turn a signed-out visitor into a crash rather than a redirect.
  const user = await requireUser('/account');
  const orders = all<Record<string, unknown>>(
    `SELECT order_number, status, payment_status, total_cents, currency, created_at, is_sample_order
     FROM orders WHERE user_id = ? ORDER BY id DESC LIMIT 4`,
    [user.id],
  ) as {
    order_number: string;
    status: string;
    payment_status: string;
    total_cents: number;
    currency: string;
    created_at: string;
    is_sample_order: number;
  }[];
  const counts = get<{ orders: number; addresses: number; returns: number }>(
    `SELECT (SELECT COUNT(*) FROM orders WHERE user_id = ?) AS orders,
            (SELECT COUNT(*) FROM addresses WHERE user_id = ?) AS addresses,
            (SELECT COUNT(*) FROM returns r JOIN orders o ON o.id = r.order_id WHERE o.user_id = ?) AS returns`,
    [user.id, user.id, user.id],
  );
  const bag = countItems(`user:${user.id}`);
  return (
    <div className="space-y-9">
      <section className="grid gap-4 sm:grid-cols-3">
        {[
          { label: 'Orders placed', value: counts?.orders ?? 0, href: '/account/orders' },
          { label: 'Saved addresses', value: counts?.addresses ?? 0, href: '/account/addresses' },
          { label: 'Open requests', value: counts?.returns ?? 0, href: '/account/returns' },
        ].map((s) => (
          <Link key={s.label} href={s.href} className="card p-5 transition hover:shadow-lift">
            <p className="eyebrow">{s.label}</p>
            <p className="mt-1.5 font-display text-[30px] leading-none tabular-nums">{s.value}</p>
          </Link>
        ))}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="eyebrow">Recent orders</h2>
          <Link href="/account/orders" className="text-[12px] tracking-label text-ink-500 underline-offset-4 hover:underline">
            View all
          </Link>
        </div>
        {orders.length === 0 ? (
          <div className="border border-dashed border-stone-300 bg-white/50 px-5 py-8">
            <p className="font-display text-[20px]">No orders yet</p>
            <p className="mt-1.5 text-[13.5px] text-ink-500">
              {bag > 0 ? `You have ${String(bag)} item(s) waiting in your bag.` : 'When you place an order it will appear here.'}
            </p>
            <Link href="/shop" className="btn-outline mt-4 inline-flex">Browse the range</Link>
          </div>
        ) : (
          <ul className="divide-y divide-stone-200 border-y border-stone-200">
            {orders.map((o) => (
              <li key={o.order_number as string} className="flex flex-wrap items-center justify-between gap-3 py-3.5">
                <div>
                  <Link href={`/order/${o.order_number}`} className="font-display text-[16px] hover:underline">
                    {o.order_number}
                  </Link>
                  <p className="text-[12px] text-ink-600">
                    {new Date(o.created_at as string).toLocaleDateString('en-IN', { dateStyle: 'medium' })} ·{' '}
                    {humanStatus(o.status as string)}
                    {o.is_sample_order === 1 ? ' · test order' : ''}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-[13.5px] tabular-nums">{formatMoney(o.total_cents as number, o.currency as string)}</span>
                  <Link href={`/order/${o.order_number}`} className="text-[12px] tracking-label text-ink-500 underline-offset-4 hover:underline">
                    Details
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card p-5">
        <h2 className="eyebrow mb-2">Account</h2>
        <dl className="grid gap-x-8 gap-y-2 text-[13.5px] sm:grid-cols-2">
          <Info label="Name" value={user.fullName || '—'} />
          <Info label="Email" value={user.email} />
          <Info label="Phone" value={user.phone ?? 'Not added'} />
          <Info label="Role" value={user.role} />
        </dl>
        <Link href="/account/profile" className="btn-quiet mt-4 inline-flex text-[11.5px]">Manage profile &amp; security</Link>
      </section>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <dt className="w-20 shrink-0 text-ink-600">{label}</dt>
      <dd className="truncate text-ink-700">{value}</dd>
    </div>
  );
}
