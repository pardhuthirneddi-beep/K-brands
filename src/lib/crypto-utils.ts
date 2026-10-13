import crypto from 'node:crypto';
import { requireServerCryptoSecret } from './env.ts';

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

/** One-way token hashing for lookup-by-token columns (sessions, resets, webhooks). */
export function hashToken(token: string): string {
  return sha256(`${requireServerCryptoSecret()}|${token}`);
}

/** Short, non-identifying fingerprint for logs/audit (never store raw IP/UA). */
export function fingerprint(value: string | undefined | null): string {
  if (!value) return 'unknown';
  return sha256(`${requireServerCryptoSecret()}|${value}`).slice(0, 16);
}

export function timingSafeEqualStr(a: string, b: string): boolean {
  const bufA = crypto.createHash('sha256').update(String(a)).digest();
  const bufB = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(bufA, bufB);
}

export function hmacHex(payload: string): string {
  return crypto.createHmac('sha256', requireServerCryptoSecret()).update(payload).digest('hex');
}

export function hmacBase64Url(payload: string): string {
  return crypto.createHmac('sha256', requireServerCryptoSecret()).update(payload).digest('base64url');
}

export function safeJsonParse<T>(raw: string | null | undefined, dflt: T): T {
  if (!raw) return dflt;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return dflt;
  }
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
    .join(',')}}`;
}

/** scrypt password hashing: no external dependency, appropriate for server-side use. */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password.normalize('NFKC'), salt, 32, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [scheme, n, r, p, saltB64, keyB64] = stored.split('$');
    if (scheme !== 'scrypt') return false;
    const salt = Buffer.from(saltB64 ?? '', 'base64url');
    const expected = Buffer.from(keyB64 ?? '', 'base64url');
    const actual = crypto.scryptSync(password.normalize('NFKC'), salt, expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    });
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}
