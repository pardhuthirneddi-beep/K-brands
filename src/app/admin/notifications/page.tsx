import { ensureDb } from '@/lib/bootstrap.ts';
import { all } from '@/db/client.ts';
import { recentNotifications, notificationStats, emailTransportReady } from '@/domain/notifications.ts';
import { Panel, Table } from '@/components/admin/panel.tsx';
import { Badge } from '@/components/ui/badge.tsx';
import { ActionButton } from '@/components/admin/action-button.tsx';
import * as env from '@/lib/env.ts';

import { requireAdminPage } from '@/lib/session.ts';
ensureDb();
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Notifications' };

type Row = {
  id: number;
  template: string;
  recipient: string;
  subject: string;
  status: string;
  attempts: number;
  provider: string | null;
  last_error: string | null;
  created_at: string;
  sent_at: string | null;
  related_id: string | null;
};

export default async function AdminNotificationsPage() {
  await requireAdminPage();
  const stats = notificationStats();
  const rows = recentNotifications(80) as unknown as Row[];
  const failures = all<{ n: number }>("SELECT COUNT(*) AS n FROM notifications WHERE status = 'failed'")[0]?.n ?? 0;
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Lifecycle</p>
          <h1 className="font-display text-[27px] leading-tight">Notifications</h1>
          <p className="mt-1.5 max-w-3xl text-[12.5px] leading-relaxed text-ink-500">
            Every customer email is first a queue row, so a missing transport never loses a message and never fakes a
            delivery. With <code className="text-ink-600">KBRANDS_EMAIL_MODE=none</code> rows are stored as{' '}
            <code className="text-ink-600">skipped_no_provider</code> and nothing leaves the machine.
          </p>
        </div>
        <ActionButton
          label="Flush queue"
          tone="solid"
          path="/api/admin/notifications"
          body={{}}
          confirm="Attempt delivery for every queued notification?"
        />
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Panel title="Transport">
          <p className="flex items-center gap-2 text-[13px]">
            <Badge tone={emailTransportReady() ? 'ok' : 'warn'}>{emailTransportReady() ? `live (${env.emailMode})` : 'not configured'}</Badge>
            <span className="text-ink-400">{env.emailFrom}</span>
          </p>
          <p className="mt-2 text-[12px] leading-relaxed text-ink-500">
            {emailTransportReady()
              ? 'A transport is present, so queued mail will be attempted on flush and on the next lifecycle event.'
              : 'Set KBRANDS_EMAIL_MODE and an API key to send. Until then the queue is the record — no SMTP is attempted.'}
          </p>
        </Panel>
        <Panel title="Queue">
          <ul className="space-y-1 text-[12.5px]">
            {Object.entries(stats).map(([k, v]) => (
              <li key={k} className="flex items-center justify-between gap-3">
                <span className="text-ink-500">{k.replace(/_/g, ' ')}</span>
                <span className="tabular-nums">{v}</span>
              </li>
            ))}
            {Object.keys(stats).length === 0 ? <li className="text-ink-400">Empty.</li> : null}
            {failures > 0 ? <li className="pt-1 text-alert-error">{failures} failed — see the error column below</li> : null}
          </ul>
        </Panel>
      </div>

      <Panel title="Recent queue rows" note="Recipient addresses are stored as supplied; nothing here is echoed back to a browser beyond this admin page.">
        {rows.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-ink-400">Nothing has been queued yet. Place an order to generate one.</p>
        ) : (
          <Table head={['When', 'Template', 'Recipient', 'Subject', 'Status', 'Ref', 'Attempts / error']}>
            {rows.map((n) => (
              <tr key={n.id} className="align-top">
                <td className="whitespace-nowrap py-2 pr-4 text-[12px] text-ink-400">{n.created_at.slice(5, 16).replace('T', ' ')}</td>
                <td className="py-2 pr-4 font-mono text-[11.5px]">{n.template}</td>
                <td className="max-w-[180px] truncate py-2 pr-4 text-[12.5px] text-ink-500">{n.recipient}</td>
                <td className="max-w-[240px] truncate py-2 pr-4 text-[12.5px]">{n.subject}</td>
                <td className="py-2 pr-4">
                  <Badge tone={n.status === 'sent' ? 'ok' : n.status === 'failed' ? 'error' : n.status === 'queued' ? 'warn' : 'neutral'}>
                    {n.status.replace(/_/g, ' ')}
                  </Badge>
                </td>
                <td className="py-2 pr-4 text-[12px] text-ink-400">{n.related_id ?? '—'}</td>
                <td className="py-2 pr-4 text-[12px] text-ink-500">
                  {n.attempts} attempt{n.attempts === 1 ? '' : 's'}
                  {n.last_error ? <span className="block text-[11.5px] text-alert-error">{n.last_error}</span> : null}
                  {n.sent_at ? <span className="block text-[11.5px] text-alert-ok">sent {n.sent_at.slice(5, 16).replace('T', ' ')}</span> : null}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>
    </div>
  );
}

