import crypto from 'node:crypto';
import { all, get, run, transaction } from '../db/client.ts';
import { hashPassword, hashToken, verifyPassword } from '../lib/crypto-utils.ts';
import * as env from '../lib/env.ts';
import { AppError } from '../lib/errors.ts';
import { consume } from '../lib/rate-limit.ts';

export type Role = 'customer' | 'admin' | 'staff';

export type UserRow = {
  id: number;
  email: string;
  email_norm: string;
  password_hash: string;
  full_name: string;
  phone: string | null;
  role: Role;
  status: 'active' | 'suspended' | 'pending_verification';
  failed_login_count: number;
  locked_until: string | null;
  email_verified_at: string | null;
  created_at: string;
  last_login_at: string | null;
};

export type AuthenticatedUser = {
  id: number;
  email: string;
  fullName: string;
  phone: string | null;
  role: Role;
  status: UserRow['status'];
  sessionId: string;
  csrfToken: string;
};

const nowIso = () => new Date().toISOString();
export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

/* ------------------------------------------------------------------ accounts */

export function registerCustomer(input: {
  email: string;
  password: string;
  fullName: string;
  phone?: string | null;
}): { user: UserRow } {
  const emailNorm = normalizeEmail(input.email);
  return transaction(() => {
    const existing = get<UserRow>('SELECT * FROM users WHERE email_norm = ?', [emailNorm]);
    if (existing) {
      // Do not disclose whether the address exists in a "did you mean" way beyond
      // what is required to complete signup — email uniqueness is user-visible by design.
      throw new AppError('validation_error', 'An account already exists for this email address.', 409, {
        email: 'An account already exists for this email address.',
      });
    }
    const ts = nowIso();
    const inserted = run(
      `INSERT INTO users (email, email_norm, password_hash, full_name, phone, role, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'customer', 'active', ?, ?)`,
      [
        input.email.trim(),
        emailNorm,
        hashPassword(input.password),
        input.fullName.trim().slice(0, 120),
        input.phone?.trim() || null,
        ts,
        ts,
      ],
    );
    return { user: get<UserRow>('SELECT * FROM users WHERE id = ?', [inserted.lastInsertRowid])! };
  });
}

/**
 * Bootstrap admin: created only from a server-side env secret. There is no
 * public route, no hidden form field and no default password that can grant
 * elevated rights (see docs/security.md).
 */
export function bootstrapAdminFromEnv(): { created: boolean; reason: string } {
  const email = process.env.KBRANDS_BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.KBRANDS_BOOTSTRAP_ADMIN_PASSWORD;
  if (!email || !password) return { created: false, reason: 'no bootstrap env provided' };
  if (password.length < 14) {
    return { created: false, reason: 'bootstrap admin password too short (min 14 chars)' };
  }
  const existing = get<UserRow>('SELECT * FROM users WHERE email_norm = ?', [email]);
  if (existing) {
    if (existing.role === 'admin') return { created: false, reason: 'admin already exists' };
    run("UPDATE users SET role = 'admin', updated_at = ? WHERE id = ?", [nowIso(), existing.id]);
    return { created: true, reason: 'elevated existing account to admin' };
  }
  const ts = nowIso();
  run(
    `INSERT INTO users (email, email_norm, password_hash, full_name, role, status, email_verified_at, created_at, updated_at)
     VALUES (?, ?, ?, 'Store Administrator', 'admin', 'active', ?, ?, ?)`,
    [email, email, hashPassword(password), ts, ts, ts],
  );
  return { created: true, reason: 'created admin from env bootstrap' };
}

/* -------------------------------------------------------------------- login */

export function authenticate(input: {
  email: string;
  password: string;
  subject: string;
}): { user: UserRow; ok: true } | { ok: false; message: string } {
  const emailNorm = normalizeEmail(input.email);
  const result = transaction(() => {
    const user = get<UserRow>('SELECT * FROM users WHERE email_norm = ?', [emailNorm]);
    if (!user) {
      // Constant-ish work on the miss path to reduce user-enumeration timing.
      verifyPassword(input.password, 'scrypt$16384$8$1$AAAA$AAAA');
      return { ok: false as const, message: 'Incorrect email or password.' };
    }
    if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
      return { ok: false as const, message: 'Too many attempts. Try again later.', locked: true };
    }
    if (user.status === 'suspended') {
      return { ok: false as const, message: 'This account is suspended. Contact support.' };
    }
    if (!verifyPassword(input.password, user.password_hash)) {
      const attempts = user.failed_login_count + 1;
      const lock = attempts >= 6 ? new Date(Date.now() + 15 * 60_000).toISOString() : null;
      run('UPDATE users SET failed_login_count = ?, locked_until = ? WHERE id = ?', [
        attempts,
        lock,
        user.id,
      ]);
      return { ok: false as const, message: 'Incorrect email or password.' };
    }
    run("UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login_at = ? WHERE id = ?", [
      nowIso(),
      user.id,
    ]);
    return { ok: true as const, user: get<UserRow>('SELECT * FROM users WHERE id = ?', [user.id])! };
  });
  return result;
}

/* ------------------------------------------------------------------ sessions */

export type SessionRow = {
  id: string;
  user_id: number;
  expires_at: string;
  revoked_at: string | null;
  csrf_token: string;
};

export function createSession(
  userId: number,
  meta: { ip?: string | null; userAgent?: string | null } = {},
): { sessionId: string; token: string; csrfToken: string; expiresAt: string } {
  const sessionId = crypto.randomUUID();
  const token = crypto.randomBytes(32).toString('base64url');
  const csrfToken = crypto.randomBytes(24).toString('base64url');
  const expires = new Date(Date.now() + env.sessionTtlDays * 86400_000).toISOString();
  run(
    `INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at, last_seen_at, revoked_at, ip_hash, user_agent, csrf_token)
     VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
    [
      sessionId,
      userId,
      hashToken(token),
      expires,
      nowIso(),
      nowIso(),
      meta.ip ? crypto.createHash('sha256').update(`${meta.ip}|${env.defaultCountry}`).digest('hex').slice(0, 24) : null,
      (meta.userAgent ?? '').slice(0, 180),
      csrfToken,
    ],
  );
  return { sessionId, token, csrfToken, expiresAt: expires };
}

export function resolveSession(token: string | undefined | null): AuthenticatedUser | null {
  if (!token) return null;
  const row = get<
    SessionRow & {
      user_id: number;
      email: string;
      full_name: string;
      phone: string | null;
      role: Role;
      status: UserRow['status'];
    }
  >(
    `SELECT s.id, s.expires_at, s.revoked_at, s.csrf_token, u.id AS user_id, u.email, u.full_name, u.phone, u.role, u.status
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ?`,
    [hashToken(token)],
  );
  if (!row) return null;
  if (row.revoked_at) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;
  if (row.status === 'suspended') return null;
  // Touch last_seen_at at most once per 60s to keep reads cheap.
  const seen = get<{ last_seen_at: string }>('SELECT last_seen_at FROM sessions WHERE id = ?', [row.id]);
  const stale = !seen || Date.now() - new Date(seen.last_seen_at).getTime() > 60_000;
  if (stale) run('UPDATE sessions SET last_seen_at = ? WHERE id = ?', [nowIso(), row.id]);
  return {
    id: row.user_id,
    email: row.email,
    fullName: row.full_name,
    phone: row.phone,
    role: row.role,
    status: row.status,
    sessionId: row.id,
    csrfToken: row.csrf_token,
  };
}

export function revokeSession(sessionId: string): void {
  run('UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL', [nowIso(), sessionId]);
}

export function revokeAllSessions(userId: number, exceptSessionId?: string): number {
  return run(
    exceptSessionId
      ? 'UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL AND id <> ?'
      : 'UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL',
    exceptSessionId ? [nowIso(), userId, exceptSessionId] : [nowIso(), userId],
  ).changes;
}

export function changePassword(
  userId: number,
  currentPassword: string,
  newPassword: string,
): { revoked: number } {
  return transaction(() => {
    const user = get<UserRow>('SELECT * FROM users WHERE id = ?', [userId]);
    if (!user) throw new AppError('unauthorized', 'Session expired. Please sign in again.', 401);
    if (!verifyPassword(currentPassword, user.password_hash)) {
      throw new AppError('validation_error', 'Your current password is not correct.', 400, {
        current_password: 'Incorrect password',
      });
    }
    if (newPassword.length < 10) {
      throw new AppError('validation_error', 'Choose a longer password.', 400, {
        new_password: 'Use at least 10 characters',
      });
    }
    run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', [
      hashPassword(newPassword),
      nowIso(),
      userId,
    ]);
    const revoked = run('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL', [
      nowIso(),
      userId,
    ]).changes;
    return { revoked };
  });
}

/* ------------------------------------------------------- password recovery */

export function beginPasswordReset(email: string): { token: string | null; sent: boolean } {
  const emailNorm = normalizeEmail(email);
  const user = get<UserRow>('SELECT * FROM users WHERE email_norm = ?', [emailNorm]);
  if (!user) {
    // Always reported as "if an account exists" at the call site — no enumeration.
    return { token: null, sent: false };
  }
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + 45 * 60_000).toISOString();
  run(
    `INSERT INTO auth_tokens (user_id, purpose, token_hash, expires_at, created_at)
     VALUES (?, 'password_reset', ?, ?, ?)`,
    [user.id, hashToken(token), expires, nowIso()],
  );
  run('DELETE FROM auth_tokens WHERE user_id = ? AND purpose = ? AND expires_at < ?', [
    user.id,
    'password_reset',
    nowIso(),
  ]);
  return { token, sent: true };
}

export function consumePasswordResetToken(
  token: string,
  newPassword: string,
): { ok: true } {
  if (newPassword.length < 10) {
    throw new AppError('validation_error', 'Choose a longer password.', 400, {
      password: 'Use at least 10 characters',
    });
  }
  return transaction(() => {
    const row = get<{ id: number; user_id: number; expires_at: string; used_at: string | null }>(
      `SELECT id, user_id, expires_at, used_at FROM auth_tokens WHERE purpose = 'password_reset' AND token_hash = ?`,
      [hashToken(token)],
    );
    if (!row || row.used_at || new Date(row.expires_at).getTime() < Date.now()) {
      throw new AppError(
        'validation_error',
        'This reset link is invalid or has expired. Please request a new one.',
        400,
      );
    }
    run('UPDATE auth_tokens SET used_at = ? WHERE id = ?', [nowIso(), row.id]);
    run('UPDATE users SET password_hash = ?, updated_at = ?, failed_login_count = 0, locked_until = NULL WHERE id = ?', [
      hashPassword(newPassword),
      nowIso(),
      row.user_id,
    ]);
    run('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL', [nowIso(), row.user_id]);
    return { ok: true } as const;
  });
}

/* ------------------------------------------------------------------- guards */

export function requireRole(user: AuthenticatedUser | null, role: Role | Role[]): AuthenticatedUser {
  if (!user) throw new AppError('unauthorized', 'Please sign in to continue.', 401);
  const roles = Array.isArray(role) ? role : [role];
  if (!roles.includes(user.role)) {
    throw new AppError('forbidden', 'You do not have access to this area.', 403);
  }
  return user;
}

export const isAdmin = (user: AuthenticatedUser | null): boolean =>
  Boolean(user && (user.role === 'admin' || user.role === 'staff'));

export function assertOwnership(user: AuthenticatedUser, ownerId: number | null | undefined): void {
  if (ownerId == null) {
    throw new AppError('not_found', 'We could not find that record.', 404);
  }
  if (user.id !== ownerId) {
    // Deliberately identical to the 404 text: never confirm existence.
    throw new AppError('not_found', 'We could not find that record.', 404);
  }
}

export function listAccountsForAdmin(limit = 100) {
  return all(
    `SELECT u.id, u.email, u.full_name, u.phone, u.role, u.status, u.created_at, u.last_login_at,
            (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id) AS order_count
     FROM users u ORDER BY u.id DESC LIMIT ?`,
    [Math.min(limit, 500)],
  );
}
