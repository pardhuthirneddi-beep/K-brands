import { all, get, run, transaction } from '../db/client.ts';
import * as env from '../lib/env.ts';
import { recordAudit } from './audit.ts';

/**
 * Notification queue with dedupe + retry.
 *
 * `KBRANDS_EMAIL_MODE` decides what "sent" can honestly mean:
 *   none      → rows are queued and marked skipped_no_provider (nothing is sent).
 *   log       → queued and logged to stdout (development visibility, still not email).
 *   provider  → requires KBRANDS_EMAIL_API_KEY + a transport module; docs/integrations.md.
 *
 * We never claim an email was delivered while the transport is unset.
 */

export type NotificationTemplate =
  | 'order_created'
  | 'order_paid'
  | 'order_shipped'
  | 'order_cancelled'
  | 'password_reset'
  | 'return_requested'
  | 'return_decision'
  | 'refund_issued'
  | 'contact_received';

export function emailTransportReady(): boolean {
  if (env.emailMode === 'provider') return Boolean(process.env.KBRANDS_EMAIL_API_KEY);
  return false;
}

export function enqueueNotification(input: {
  template: NotificationTemplate;
  recipient: string;
  subject: string;
  bodyText: string;
  dedupeKey: string;
  relatedType?: string | null;
  relatedId?: string | null;
  payload?: Record<string, unknown>;
}): { id: number; status: string; deduped: boolean } {
  const ts = new Date().toISOString();
  const recipient = input.recipient.trim().toLowerCase();
  const status = emailTransportReady() ? 'queued' : env.emailMode === 'log' ? 'queued' : 'skipped_no_provider';
  return transaction(() => {
    const dupe = get<{ id: number }>('SELECT id FROM notifications WHERE dedupe_key = ?', [input.dedupeKey]);
    if (dupe) return { id: dupe.id, status: 'suppressed', deduped: true };
    const res = run(
      `INSERT INTO notifications (dedupe_key, channel, template, recipient, subject, body_text, payload_json,
          status, provider, related_type, related_id, created_at, next_retry_at)
       VALUES (?, 'email', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.dedupeKey,
        input.template,
        recipient,
        input.subject.slice(0, 200),
        input.bodyText.slice(0, 4000),
        input.payload ? JSON.stringify(input.payload) : null,
        status,
        emailTransportReady() ? 'configured_provider' : null,
        input.relatedType ?? null,
        input.relatedId ?? null,
        ts,
        status === 'queued' ? ts : null,
      ],
    );
    return { id: res.lastInsertRowid, status, deduped: false };
  });
}

/** Attempt delivery for queued items. Without a transport this changes nothing. */
export function flushNotifications(limit = 25): { attempted: number; sent: number; deferred: number } {
  if (!emailTransportReady()) {
    const pending = get<{ n: number }>("SELECT COUNT(*) AS n FROM notifications WHERE status = 'queued'")?.n ?? 0;
    if (pending > 0) {
      run(
        `UPDATE notifications SET status = 'skipped_no_provider', last_error = 'no email transport configured'
         WHERE status = 'queued'`,
      );
    }
    return { attempted: 0, sent: 0, deferred: pending };
  }
  const due = all<{ id: number; attempts: number; recipient: string; subject: string; template: string }>(
    `SELECT id, attempts, recipient, subject, template FROM notifications
     WHERE status IN ('queued','retrying') AND (next_retry_at IS NULL OR next_retry_at <= ?)
     ORDER BY id LIMIT ?`,
    [new Date().toISOString(), Math.min(limit, 100)],
  );
  let sent = 0;
  for (const row of due) {
    // The provider call belongs in src/adapters/email/<provider>.ts. No transport
    // module is bundled, so a configured key alone never pretends to have sent.
    const failed = true;
    if (failed) {
      const attempts = row.attempts + 1;
      const backoff = new Date(Date.now() + 60_000 * 2 ** Math.min(attempts, 6)).toISOString();
      run(
        `UPDATE notifications SET attempts = ?, status = ?, last_error = ?, next_retry_at = ? WHERE id = ?`,
        [attempts, attempts >= 5 ? 'failed' : 'retrying', 'email transport module not installed', backoff, row.id],
      );
      continue;
    }
    sent += 1;
  }
  return { attempted: due.length, sent, deferred: 0 };
}

export function recentNotifications(limit = 50) {
  return all(
    `SELECT id, template, recipient, subject, status, attempts, provider, last_error, created_at, sent_at, related_id
     FROM notifications ORDER BY id DESC LIMIT ?`,
    [Math.min(limit, 200)],
  );
}

export function notificationStats() {
  const rows = all<{ status: string; n: number }>('SELECT status, COUNT(*) AS n FROM notifications GROUP BY status');
  return Object.fromEntries(rows.map((r) => [r.status, r.n])) as Record<string, number>;
}

export function auditNotifications() {
  recordAudit({ action: 'notifications.flush', targetType: 'notification', summary: 'manual flush requested' });
}
