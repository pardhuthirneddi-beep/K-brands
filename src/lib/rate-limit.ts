import { get, run, transaction } from '../db/client.ts';

/**
 * Fixed-window limiter persisted in SQLite, so limits survive restarts and are
 * shared by every worker on the host. Scope subjects are caller-supplied
 * identifiers (user id / session id / hashed IP) — raw IPs are not stored.
 */
export type LimitRule = { bucket: string; limit: number; windowSeconds: number };

export const LIMIT_RULES = {
  login: { bucket: 'login', limit: 8, windowSeconds: 900 },
  signup: { bucket: 'signup', limit: 5, windowSeconds: 3600 },
  password_reset: { bucket: 'password_reset', limit: 5, windowSeconds: 3600 },
  contact: { bucket: 'contact', limit: 6, windowSeconds: 3600 },
  coupon: { bucket: 'coupon', limit: 20, windowSeconds: 900 },
  checkout: { bucket: 'checkout', limit: 12, windowSeconds: 900 },
  webhook: { bucket: 'webhook', limit: 240, windowSeconds: 60 },
  admin_mutation: { bucket: 'admin', limit: 120, windowSeconds: 60 },
  search: { bucket: 'search', limit: 60, windowSeconds: 60 },
  return_request: { bucket: 'return', limit: 10, windowSeconds: 3600 },
  payment_check: { bucket: 'payment_check', limit: 30, windowSeconds: 300 },
} as const satisfies Record<string, LimitRule>;

export type RateRuleKey = keyof typeof LIMIT_RULES;
export type RateResult = { ok: boolean; remaining: number; retryAfterSeconds: number };

export function consume(name: RateRuleKey, subject: string): RateResult {
  const rule = LIMIT_RULES[name];
  const nowSec = Math.floor(Date.now() / 1000);
  const windowStart = nowSec - (nowSec % rule.windowSeconds);
  const scope = `${name}:${subject}`.slice(0, 190);

  return transaction(() => {
    run(
      `INSERT INTO rate_limits (bucket, scope_hash, window_start, count) VALUES (?, ?, ?, 1)
       ON CONFLICT(bucket, scope_hash, window_start) DO UPDATE SET count = count + 1`,
      [rule.bucket, scope, windowStart],
    );
    const row = get<{ c: number }>(
      'SELECT count AS c FROM rate_limits WHERE bucket = ? AND scope_hash = ? AND window_start = ?',
      [rule.bucket, scope, windowStart],
    );
    const count = Number(row?.c ?? 1);
    const ok = count <= rule.limit;
    return {
      ok,
      remaining: Math.max(0, rule.limit - count),
      retryAfterSeconds: ok ? 0 : Math.max(1, windowStart + rule.windowSeconds - nowSec),
    };
  });
}

/** Test/maintenance helper: clear one subject's counters. */
export function resetBucket(name: RateRuleKey, subject: string): void {
  run('DELETE FROM rate_limits WHERE bucket = ? AND scope_hash = ?', [
    LIMIT_RULES[name].bucket,
    `${name}:${subject}`.slice(0, 190),
  ]);
}

export function pruneOldWindows(): number {
  const cutoff = Math.floor(Date.now() / 1000) - 86400;
  return run('DELETE FROM rate_limits WHERE window_start < ?', [cutoff]).changes;
}
