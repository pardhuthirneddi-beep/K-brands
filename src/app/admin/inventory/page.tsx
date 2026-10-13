import Link from 'next/link';
import { ensureDb } from '@/lib/bootstrap.ts';
import { all, get } from '@/db/client.ts';
import { lowStockReport } from '@/domain/inventory.ts';
import { Panel, Table, Stat } from '@/components/admin/panel.tsx';
import { Badge, SampleBadge } from '@/components/ui/badge.tsx';
import { FieldForm } from '@/components/admin/field-form.tsx';

import { requireAdminPage } from '@/lib/session.ts';
ensureDb();
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Inventory' };

type Row = {
  variant_id: number;
  product_id: number;
  title: string;
  slug: string;
  sku: string;
  size: string | null;
  color_name: string | null;
  stock_qty: number;
  reserved_qty: number;
  available: number;
  status: string;
  is_sample: number;
};

export default async function AdminInventoryPage({
  searchParams,
}
: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireAdminPage();
  const sp = await searchParams;
  const q = (sp.q ?? '').trim().slice(0, 60);
  const low =
    lowStockReport(40) as {
      variant_id: number;
      title: string;
      slug: string;
      size: string | null;
      color_name: string | null;
      sku: string;
      available: number;
      stock_qty: number;
      reserved_qty: number;
      is_sample: number;
    }[];
  const rows = (
    q
      ? all<Row>(
          `SELECT v.id AS variant_id, v.product_id, p.title, p.slug, v.sku, v.size, v.color_name, v.stock_qty, v.reserved_qty, v.status, p.is_sample,
                  (v.stock_qty - v.reserved_qty) AS available
           FROM variants v JOIN products p ON p.id = v.product_id
           WHERE v.sku LIKE ? OR p.title LIKE ? ORDER BY available ASC LIMIT 120`,
          [`%${q}%`, `%${q}%`],
        )
      : all<Row>(
          `SELECT v.id AS variant_id, v.product_id, p.title, p.slug, v.sku, v.size, v.color_name, v.stock_qty, v.reserved_qty, v.status, p.is_sample,
                  (v.stock_qty - v.reserved_qty) AS available
           FROM variants v JOIN products p ON p.id = v.product_id
           ORDER BY available ASC, p.title ASC LIMIT 120`,
        )
  );
  const totals = get<{ variants: number; units: number; reserved: number; outs: number }>(
    `SELECT COUNT(*) AS variants,
            COALESCE(SUM(v.stock_qty),0) AS units,
            COALESCE(SUM(v.reserved_qty),0) AS reserved,
            COALESCE(SUM(CASE WHEN v.stock_qty - v.reserved_qty <= 0 THEN 1 ELSE 0 END),0) AS outs
     FROM variants v JOIN products p ON p.id = v.product_id WHERE p.status != 'archived'`,
  ) ?? { variants: 0, units: 0, reserved: 0, outs: 0 };
  // A reservation is live while it is unconsumed and unexpired; expired rows are swept
  // lazily by the next checkout, so the count here reflects real holds only.
  const openReservations =
    get<{ n: number; expires_next: string | null }>(
      'SELECT COUNT(*) AS n, MIN(expires_at) AS expires_next FROM reservations WHERE consumed_at IS NULL AND expires_at > ?',
      [new Date().toISOString()],
    ) ?? { n: 0, expires_next: null };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Catalogue</p>
          <h1 className="font-display text-[27px] leading-tight">Inventory</h1>
        </div>
        <form method="GET" className="flex items-center gap-2" action="/admin/inventory">
          <label className="sr-only" htmlFor="q">Search SKU or product</label>
          <input id="q" name="q" defaultValue={q} placeholder="SKU or product" className="field max-w-[240px]" />
          <button type="submit" className="btn-outline py-2 text-[11.5px]">Search</button>
        </form>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Tracked variants" value={totals.variants} hint="Excluding archived products" />
        <Stat label="Units on hand" value={totals.units} />
        <Stat label="Reserved in baskets" value={totals.reserved} hint="Held until the reservation expires" tone={totals.reserved > 0 ? 'warn' : undefined} />
        <Stat label="Variants at zero" value={totals.outs} hint={openReservations.n > 0 ? `${openReservations.n} live basket hold${openReservations.n === 1 ? '' : 's'}, earliest release ${String(openReservations.expires_next ?? '').slice(11, 16)} UTC` : 'No live reservations'} tone={totals.outs > 0 ? 'error' : 'ok'} />
      </div>

      <Panel
        title="Low or out of stock"
        note="Availability is stock minus what is reserved by in-flight checkouts. Stock is only consumed when a payment is captured."
      >
        {low.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-ink-600">Nothing at or below three units.</p>
        ) : (
          <ul className="space-y-2">
            {low.map((v) => (
              <li key={v.variant_id} className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 pb-2 text-[13px] last:border-0">
                <span className="min-w-0">
                  <Link href={`/admin/products/${v.slug}`} className="font-medium underline-offset-4 hover:underline">
                    {v.title}
                  </Link>
                  <span className="ml-2 font-mono text-[11.5px] text-ink-600">{v.sku}</span>
                  {v.is_sample === 1 ? <span className="ml-2 align-middle"><SampleBadge /></span> : null}
                </span>
                <span className={`tabular-nums ${v.available === 0 ? 'text-alert-error' : 'text-alert-warn'}`}>
                  {v.available} available · {v.stock_qty} on hand · {v.reserved_qty} reserved
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="All variants" note="Adjustments are ledger entries, not edits to a number — history is never overwritten.">
        <Table head={['Variant', 'SKU', 'On hand', 'Reserved', 'Available', 'Status', 'Adjust']}>
          {rows.map((v) => (
            <tr key={v.variant_id} className="align-top">
              <td className="py-2 pr-4">
                <Link href={`/admin/products/${v.slug}`} className="underline-offset-4 hover:underline">
                  {v.title}
                </Link>
                <span className="block text-[11.5px] text-ink-600">
                  {v.size ?? 'One size'} {v.color_name ? `· ${v.color_name}` : ''}
                </span>
              </td>
              <td className="py-2 pr-4 font-mono text-[11.5px] text-ink-600">{v.sku}</td>
              <td className="py-2 pr-4 tabular-nums">{v.stock_qty}</td>
              <td className="py-2 pr-4 tabular-nums">{v.reserved_qty}</td>
              <td className={`py-2 pr-4 tabular-nums ${v.available === 0 ? 'text-alert-error' : v.available <= 3 ? 'text-alert-warn' : ''}`}>
                {v.available}
              </td>
              <td className="py-2 pr-4">
                <Badge tone={v.status === 'active' ? 'ok' : 'neutral'}>{v.status}</Badge>
              </td>
              <td className="py-2 pr-4">
                <div className="flex gap-1">
                  {[1, 10].map((n) => (
                    <FieldForm
                      key={`plus${n}`}
                      path="/api/admin/stock"
                      submitLabel={`+${n}`}
                      resetOnSuccess={false}
                      fields={[
                        { name: 'variantId', type: 'hidden', value: v.variant_id },
                        { name: 'delta', type: 'hidden', value: n },
                        { name: 'note', type: 'hidden', value: 'admin quick restock' },
                      ]}
                    />
                  ))}
                  <FieldForm
                    path="/api/admin/stock"
                    submitLabel="−1"
                    danger
                    resetOnSuccess={false}
                    confirm="Remove one unit from stock?"
                    fields={[
                      { name: 'variantId', type: 'hidden', value: v.variant_id },
                      { name: 'delta', type: 'hidden', value: -1 },
                      { name: 'note', type: 'hidden', value: 'admin write-off' },
                    ]}
                  />
                </div>
              </td>
            </tr>
          ))}
        </Table>
      </Panel>

      <Panel title="Recent stock movements">
        <Table head={['When', 'Variant', 'Change', 'Balance', 'Reason', 'Note']}>
          {all<{ created_at: string; sku: string; change_qty: number; balance_after: number; reason: string; note: string | null }>(
            `SELECT l.created_at, v.sku, l.change_qty, l.balance_after, l.reason, l.note
             FROM inventory_ledger l JOIN variants v ON v.id = l.variant_id ORDER BY l.id DESC LIMIT 15`,
          ).map((m, i) => (
            <tr key={i}>
              <td className="whitespace-nowrap py-2 pr-4 text-[12px] text-ink-600">{String(m.created_at).slice(0, 16).replace('T', ' ')}</td>
              <td className="py-2 pr-4 font-mono text-[11.5px]">{m.sku}</td>
              <td className={`py-2 pr-4 tabular-nums ${m.change_qty < 0 ? 'text-alert-error' : 'text-alert-ok'}`}>
                {m.change_qty > 0 ? `+${m.change_qty}` : m.change_qty}
              </td>
              <td className="py-2 pr-4 tabular-nums">{m.balance_after}</td>
              <td className="py-2 pr-4 text-[12px]">{m.reason}</td>
              <td className="max-w-[240px] truncate py-2 pr-4 text-[12px] text-ink-600">{m.note ?? '—'}</td>
            </tr>
          ))}
        </Table>
      </Panel>
    </div>
  );
}
