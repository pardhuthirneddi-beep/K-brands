import Link from 'next/link';
import { ensureDb } from '@/lib/bootstrap.ts';
import { all, get } from '@/db/client.ts';
import { productCount } from '@/domain/catalog.ts';
import { lowStockReport } from '@/domain/inventory.ts';
import { humanStatus } from '@/domain/orders.ts';
import { readinessReport, requiresReview } from '@/domain/settings.ts';
import { paymentModeLabel } from '@/adapters/payment.ts';
import { notificationStats } from '@/domain/notifications.ts';
import { Panel, Stat, Table } from '@/components/admin/panel.tsx';
import { Badge, ReviewBadge, SampleBadge } from '@/components/ui/badge.tsx';
import { formatMoney } from '@/domain/money.ts';
import * as env from '@/lib/env.ts';

import { requireAdminPage } from '@/lib/session.ts';
ensureDb();
export const dynamic = 'force-dynamic';

export default async function AdminDashboard() {
  await requireAdminPage();
  const counts = productCount();
  const readiness = readinessReport();
  const payment = paymentModeLabel();
  const today = new Date().toISOString().slice(0, 10);
  const kpis =
    get<{
      orders: number;
      revenue: number;
      open: number;
      sampleOrders: number;
    }>(
      `SELECT COUNT(*) AS orders,
              COALESCE(SUM(CASE WHEN payment_status IN ('captured') THEN total_cents ELSE 0 END), 0) AS revenue,
              COALESCE(SUM(CASE WHEN status IN ('pending_payment','awaiting_payment_confirmation','paid','awaiting_fulfilment','packed') THEN 1 ELSE 0 END), 0) AS open,
              COALESCE(SUM(CASE WHEN is_sample_order = 1 THEN 1 ELSE 0 END), 0) AS sampleOrders
       FROM orders`,
    ) ?? { orders: 0, revenue: 0, open: 0, sampleOrders: 0 };
  const recent = all<Record<string, unknown>>(
    `SELECT o.id, o.order_number, o.status, o.payment_status, o.total_cents, o.currency, o.created_at, o.is_sample_order,
            COALESCE(u.email, o.guest_email) AS email
     FROM orders o LEFT JOIN users u ON u.id = o.user_id ORDER BY o.id DESC LIMIT 8`,
  ) as {
    id: number;
    order_number: string;
    status: string;
    payment_status: string;
    total_cents: number;
    currency: string;
    created_at: string;
    is_sample_order: number;
    email: string;
  }[];
  const low = lowStockReport(6) as { variant_id: number; title: string; size: string | null; available: number; is_sample: number }[];
  const openReturns = get<{ n: number }>("SELECT COUNT(*) AS n FROM returns WHERE status NOT IN ('closed','refunded','rejected','cancelled')")?.n ?? 0;
  const notifications = notificationStats();

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Dashboard</p>
          <h1 className="font-display text-[27px] leading-tight">Store status</h1>
        </div>
        <Link href="/admin/settings" className="btn-solid py-2 text-[11.5px]">
          Review readiness ({String(readiness.blockers.length)})
        </Link>
      </header>

      {!env.liveCommerceEnabled ? (
        <div className="border border-dashed border-sand-500/70 bg-sand-100/70 px-4 py-3 text-[13px] leading-relaxed text-ink-600">
          <strong className="font-semibold">Pre-launch mode.</strong> {payment.detail} Sample catalogue records are
          visible to the storefront because <code className="rounded-xs bg-white/70 px-1 text-[12px]">KBRANDS_DEMO_CATALOGUE</code> is on. Turn
          it off to hide every sample record; publishing one to a live store is blocked server-side either way.
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Orders (all time)" value={kpis.orders} hint={`${kpis.open} awaiting action · today ${today}`} />
        <Stat label="Captured revenue" value={formatMoney(kpis.revenue, 'INR')} hint="Verified payments only" tone={kpis.revenue > 0 ? 'ok' : undefined} />
        <Stat label="Catalogue records" value={counts.total} hint={`${counts.sample} sample · ${counts.real} verified · ${counts.published} published`} />
        <Stat label="Open return requests" value={openReturns} hint={openReturns > 0 ? 'Awaiting review or inspection' : 'Nothing pending'} tone={openReturns > 0 ? 'warn' : undefined} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
        <Panel
          title="Recent orders"
          action={
            <Link href="/admin/orders" className="text-[12px] uppercase tracking-widest text-ink-500 hover:text-ink">
              All orders
            </Link>
          }
        >
          {recent.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-ink-400">
              No orders yet. Place a sandbox order from the storefront to exercise the full flow.
            </p>
          ) : (
            <Table head={['Order', 'Customer', 'Status', 'Payment', 'Total']}>
              {recent.map((o) => (
                <tr key={o.id}>
                  <td className="py-2 pr-4">
                    <Link href={`/admin/orders/${o.id}`} className="font-medium underline-offset-4 hover:underline">
                      {o.order_number}
                    </Link>
                    {o.is_sample_order === 1 ? <span className="ml-2 align-middle"><SampleBadge /></span> : null}
                  </td>
                  <td className="max-w-[180px] truncate py-2 pr-4 text-ink-500">{o.email}</td>
                  <td className="py-2 pr-4">
                    <Badge tone="outline">{humanStatus(o.status)}</Badge>
                  </td>
                  <td className="py-2 pr-4">
                    <Badge tone={o.payment_status === 'captured' ? 'ok' : o.payment_status === 'failed' ? 'error' : 'neutral'}>
                      {o.payment_status}
                    </Badge>
                  </td>
                  <td className="py-2 pr-4 tabular-nums">{formatMoney(o.total_cents, o.currency)}</td>
                </tr>
              ))}
            </Table>
          )}
        </Panel>

        <Panel title="Low stock" action={<Link href="/admin/inventory" className="text-[12px] uppercase tracking-widest text-ink-500 hover:text-ink">Manage</Link>}>
          {low.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-ink-400">Every variant has stock above the alert level.</p>
          ) : (
            <ul className="space-y-2.5">
              {low.map((v) => (
                <li key={v.variant_id} className="flex items-center justify-between gap-3 text-[13px]">
                  <span className="min-w-0">
                    <span className="block truncate">{v.title}</span>
                    <span className="text-[11.5px] text-ink-400">
                      {v.size ?? 'One size'} · variant #{v.variant_id}
                    </span>
                  </span>
                  <span className={`shrink-0 tabular-nums ${v.available === 0 ? 'text-alert-error' : 'text-alert-warn'}`}>
                    {v.available} left
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel
          title="Configuration blockers"
          note="These must be decided by the owner before live commerce. Nothing here has been guessed for you."
          action={
            <Link href="/admin/settings" className="text-[12px] uppercase tracking-widest text-ink-500 hover:text-ink">
              Settings
            </Link>
          }
        >
          <ul className="space-y-1.5">
            {readiness.blockers.slice(0, 14).map((key) => (
              <li key={key} className="flex items-center justify-between gap-3 border-b border-stone-200 pb-1.5 text-[12.5px] last:border-0">
                <code className="truncate text-ink-600">{key}</code>
                <span className="shrink-0">{requiresReview(key) ? <ReviewBadge label="Needs approval" /> : <Badge tone="warn">Unset</Badge>}</span>
              </li>
            ))}
            {readiness.blockers.length === 0 ? <li className="py-4 text-[13px] text-alert-ok">Nothing outstanding.</li> : null}
          </ul>
        </Panel>

        <Panel title="Integration status">
          <ul className="space-y-2.5 text-[13px]">
            {[
              ['Payment provider', env.paymentProvider === 'none' ? 'Not selected' : env.paymentProvider, env.livePaymentsAvailable ? 'ok' : 'warn'],
              ['Live payments', env.livePaymentsAvailable ? 'Enabled' : 'Disabled by default', env.livePaymentsAvailable ? 'ok' : 'warn'],
              ['Shipping provider', env.shippingProvider === 'none' ? 'Not selected' : env.shippingProvider, env.shippingProvider === 'none' ? 'warn' : 'ok'],
              ['Cash on delivery', env.codEnabled ? 'Enabled' : 'Disabled until approved', env.codEnabled ? 'ok' : 'warn'],
              ['International', env.internationalShippingEnabled ? 'Enabled' : 'Disabled', 'neutral'],
              ['Email transport', env.emailMode === 'none' ? 'Not configured (queue only)' : env.emailMode, env.emailMode === 'none' ? 'warn' : 'ok'],
              ['Demo catalogue', env.demoCatalogueEnabled ? 'On (samples visible)' : 'Off', env.demoCatalogueEnabled ? 'warn' : 'ok'],
              ['Sandbox orders', env.sandboxOrdersEnabled ? 'Allowed' : 'Blocked', env.sandboxOrdersEnabled ? 'neutral' : 'ok'],
            ].map(([k, v, tone]) => (
              <li key={k as string} className="flex items-center justify-between gap-3 border-b border-stone-200 pb-2 last:border-0">
                <span className="text-ink-500">{k}</span>
                <Badge tone={tone as 'ok' | 'warn' | 'neutral'}>{v as string}</Badge>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[12px] leading-relaxed text-ink-400">
            Notification queue: {Object.entries(notifications).map(([k, v]) => `${v} ${k}`).join(' · ') || 'empty'}. Nothing
            has been delivered unless a transport is configured.
          </p>
        </Panel>
      </div>
    </div>
  );
}

