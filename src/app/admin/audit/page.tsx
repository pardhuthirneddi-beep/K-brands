import Link from 'next/link';
import { ensureDb } from '@/lib/bootstrap.ts';
import { recentAudit } from '@/domain/audit.ts';
import { Panel, Table } from '@/components/admin/panel.tsx';
import { Badge } from '@/components/ui/badge.tsx';

import { requireAdminPage } from '@/lib/session.ts';
ensureDb();
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Audit log' };

type Row = {
  id: number;
  action: string;
  actor_email: string | null;
  actor_role: string | null;
  target_type: string;
  target_id: string | null;
  summary: string;
  metadata_json: string | null;
  created_at: string;
};

export default async function AdminAuditPage({
  searchParams,
}
: {
  searchParams: Promise<{ type?: string; target?: string }>;
}) {
  await requireAdminPage();
  const sp = await searchParams;
  const targetType = (sp.type ?? '').slice(0, 30);
  const targetId = (sp.target ?? '').slice(0, 40);
  const rows = recentAudit(200, { targetType: targetType || undefined, targetId: targetId || undefined }) as unknown as Row[];

  return (
    <div className="space-y-5">
      <header>
        <p className="eyebrow">Store setup</p>
        <h1 className="font-display text-[27px] leading-tight">Audit log</h1>
        <p className="mt-1.5 max-w-3xl text-[12.5px] leading-relaxed text-ink-500">
          Append-only record of every mutation that touches money, stock, people or policy — including failed login
          locks, refunds and manual tracking entries. Payloads are stored redacted: tokens, passwords and card fields
          never reach this table.
        </p>
      </header>

      <form method="GET" action="/admin/audit" className="flex flex-wrap items-end gap-2">
        {['order', 'product', 'variant', 'settings', 'coupon', 'return', 'user', 'shipment', 'refund', 'notification'].map((t) => (
          <button
            key={t}
            type="submit"
            name="type"
            value={t}
            className={`rounded-xs border px-2.5 py-1 text-[11.5px] uppercase tracking-widest transition ${
              targetType === t ? 'border-ink bg-ink text-ivory-100' : 'border-stone-300 bg-white text-ink-500 hover:border-ink-300'
            }`}
          >
            {t}
          </button>
        ))}
        <label className="sr-only" htmlFor="target">
          Target id
        </label>
        <input id="target" name="target" defaultValue={targetId} placeholder="target id" className="field max-w-[160px]" />
        {targetType ? <input type="hidden" name="type" value={targetType} /> : null}
        <button type="submit" className="btn-outline py-2 text-[11.5px]">
          Filter
        </button>
      </form>

      <Panel title={`${rows.length} entr${rows.length === 1 ? 'y' : 'ies'}`}>
        {rows.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-ink-400">Nothing recorded for this filter.</p>
        ) : (
          <Table head={['When (UTC)', 'Action', 'Actor', 'Target', 'Summary']}>
            {rows.map((r) => (
              <tr key={r.id} className="align-top">
                <td className="whitespace-nowrap py-2 pr-4 text-[12px] text-ink-400">{r.created_at.slice(0, 19).replace('T', ' ')}</td>
                <td className="py-2 pr-4">
                  <code className="text-[11.5px] text-ink-600">{r.action}</code>
                </td>
                <td className="py-2 pr-4 text-[12.5px]">
                  {r.actor_email ?? <span className="text-ink-400">system</span>}
                  {r.actor_role ? <Badge tone={r.actor_role === 'customer' ? 'neutral' : 'ink'}>{r.actor_role}</Badge> : null}
                </td>
                <td className="py-2 pr-4 text-[12px] text-ink-500">
                  {r.target_type}
                  {r.target_id ? (
                    <Link href={`/admin/audit?target=${encodeURIComponent(r.target_id)}`} className="ml-1 font-mono text-[11.5px] underline underline-offset-2">
                      {r.target_id}
                    </Link>
                  ) : null}
                </td>
                <td className="py-2 pr-4 text-[12.5px] leading-snug text-ink-600">
                  {r.summary}
                  {r.metadata_json ? <span className="mt-0.5 block max-w-[420px] truncate font-mono text-[11.5px] text-ink-400">{r.metadata_json}</span> : null}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>
    </div>
  );
}
