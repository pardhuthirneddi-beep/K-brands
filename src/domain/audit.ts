import { all, run } from '../db/client.ts';
import { fingerprint } from '../lib/crypto-utils.ts';

export type AuditInput = {
  action: string;
  targetType: string;
  targetId?: string | number | null;
  actorUserId?: number | null;
  actorRole?: string | null;
  summary: string;
  metadata?: Record<string, unknown>;
  ip?: string | null;
};

/**
 * Audit trail for sensitive operations. Never stores raw IP/User-Agent —
 * only a salted fingerprint (see docs/security.md).
 */
export function recordAudit(input: AuditInput): void {
  run(
    `INSERT INTO audit_logs (action, actor_user_id, actor_role, target_type, target_id, summary, metadata_json, ip_hash, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.action,
      input.actorUserId ?? null,
      input.actorRole ?? null,
      input.targetType,
      input.targetId == null ? null : String(input.targetId),
      input.summary.slice(0, 500),
      input.metadata ? JSON.stringify(redact(input.metadata)) : null,
      fingerprint(input.ip ?? null),
      new Date().toISOString(),
    ],
  );
}

const SENSITIVE_KEYS = [
  'password',
  'token',
  'secret',
  'otp',
  'cvv',
  'card',
  'session',
  'authorization',
  'cookie',
  'pin',
  'email_otp',
];

export function redact<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    const lower = k.toLowerCase();
    if (SENSITIVE_KEYS.some((s) => lower.includes(s))) {
      out[k] = '[redacted]';
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = redact(v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export function recentAudit(limit = 100, filters: { targetType?: string; targetId?: string } = {}) {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (filters.targetType) {
    where.push('a.target_type = ?');
    params.push(filters.targetType);
  }
  if (filters.targetId) {
    where.push('a.target_id = ?');
    params.push(String(filters.targetId));
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return all(
    `SELECT a.*, u.email AS actor_email FROM audit_logs a
     LEFT JOIN users u ON u.id = a.actor_user_id
     ${clause}
     ORDER BY a.id DESC LIMIT ?`,
    [...params, Math.min(limit, 500)],
  );
}
