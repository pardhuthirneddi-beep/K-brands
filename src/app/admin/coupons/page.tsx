import { ensureDb } from '@/lib/bootstrap.ts';
import { listCoupons } from '@/domain/pricing.ts';
import { Panel, Table } from '@/components/admin/panel.tsx';
import { Badge, SampleBadge } from '@/components/ui/badge.tsx';
import { CouponForm } from '@/components/admin/coupon-form.tsx';
import { ActionButton } from '@/components/admin/action-button.tsx';
import { formatMoney } from '@/domain/money.ts';

import { requireAdminPage } from '@/lib/session.ts';
ensureDb();
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Discount codes' };

export default async function AdminCouponsPage() {
  await requireAdminPage();
  const coupons = listCoupons();
  const now = Date.now();
  return (
    <div className="space-y-5">
      <header>
        <p className="eyebrow">Catalogue</p>
        <h1 className="font-display text-[27px] leading-tight">Discount codes</h1>
        <p className="mt-1.5 max-w-3xl text-[12.5px] leading-relaxed text-ink-500">
          Validation runs server-side on every basket change: window, minimum subtotal, usage caps and per-customer
          limits. Codes with history are deactivated rather than deleted, so past orders keep their meaning.
        </p>
      </header>

      <Panel title={`${coupons.length} code${coupons.length === 1 ? '' : 's'}`}>
        {coupons.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-ink-400">No codes yet.</p>
        ) : (
          <Table head={['Code', 'Discount', 'Conditions', 'Usage', 'Window', 'Status']}>
            {coupons.map((c) => {
              const ended = c.ends_at ? Date.parse(c.ends_at) < now : false;
              // The create endpoint takes a whole percentage and stores value × 100, so an
              // edit round-trips through ÷ 100. Sending the stored number would 100× the discount.
              const roundTrip = {
                code: c.code,
                kind: c.kind,
                value: c.kind === 'percent' ? c.value / 100 : c.value,
                minSubtotalCents: c.min_subtotal_cents,
                maxDiscountCents: c.max_discount_cents,
                usageLimit: c.usage_limit,
                perUserLimit: c.per_user_limit,
                startsAt: c.starts_at,
                endsAt: c.ends_at,
                isSample: c.is_sample === 1,
              };
              return (
                <tr key={c.id} className="align-top">
                  <td className="py-2.5 pr-4">
                    <span className="font-mono text-[12.5px] font-medium">{c.code}</span>
                    {c.is_sample === 1 ? (
                      <span className="mt-1 block">
                        <SampleBadge label="Test code" />
                      </span>
                    ) : null}
                  </td>
                  <td className="py-2.5 pr-4 text-[12.5px] tabular-nums">
                    {c.kind === 'percent' ? `${(c.value / 100).toFixed(0)}%` : formatMoney(c.value, 'INR')}
                    {c.max_discount_cents != null ? <span className="block text-[11.5px] text-ink-400">capped at {formatMoney(c.max_discount_cents, 'INR')}</span> : null}
                  </td>
                  <td className="py-2.5 pr-4 text-[12px] text-ink-500">
                    {c.min_subtotal_cents > 0 ? <>min {formatMoney(c.min_subtotal_cents, 'INR')}</> : <>no minimum</>}
                    {c.applies_to_category_slug ? <span className="block text-[11.5px] text-ink-400">{c.applies_to_category_slug} only</span> : null}
                  </td>
                  <td className="py-2.5 pr-4 text-[12px] tabular-nums">
                    {c.used_count} used{c.redemptions !== c.used_count ? ` / ${c.redemptions} redeemed` : ''}
                    {c.usage_limit != null ? <span className="block text-[11.5px] text-ink-400">limit {c.usage_limit}{c.per_user_limit != null ? ` · ${c.per_user_limit}/customer` : ''}</span> : null}
                  </td>
                  <td className="py-2.5 pr-4 text-[12px] text-ink-500">
                    {c.starts_at ? c.starts_at.slice(0, 10) : '—'}
                    <span className="text-ink-400"> → </span>
                    {c.ends_at ? c.ends_at.slice(0, 10) : 'open'}
                  </td>
                  <td className="py-2.5 pr-4">
                    <div className="flex items-center gap-2">
                      <Badge tone={c.active === 1 && !ended ? 'ok' : ended ? 'neutral' : 'warn'}>
                        {ended ? 'expired' : c.active === 1 ? 'active' : 'inactive'}
                      </Badge>
                      <ActionButton
                        small
                        label={c.active === 1 ? 'Turn off' : 'Delete'}
                        confirm={c.active === 1 ? 'Turn this code off? Baskets using it will re-price on the next change.' : 'Delete this code? A code with redemptions is kept and turned off instead.'}
                        tone={c.active === 1 ? 'quiet' : 'danger'}
                        path={c.active === 1 ? '/api/admin/coupons' : `/api/admin/coupons?code=${encodeURIComponent(c.code)}`}
                        method={c.active === 1 ? 'POST' : 'DELETE'}
                        body={c.active === 1 ? { ...roundTrip, active: false } : undefined}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </Panel>

      <Panel title="Create or update a code" note="Saving overwrites the code with the same spelling — that is also how you edit one.">
        <CouponForm />
      </Panel>
    </div>
  );
}

