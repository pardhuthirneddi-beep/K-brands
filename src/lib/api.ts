import { NextResponse } from 'next/server';
import { AppError } from './errors.ts';
import { hashToken } from './crypto-utils.ts';
import { readUser, requireAdminUser, CSRF_HEADER } from './session.ts';
import { consume, type RateRuleKey } from './rate-limit.ts';
import type { AuthenticatedUser } from '../domain/auth.ts';

/**
 * Shared route-handler plumbing: CSRF check, rate limiting, error shaping.
 * Error responses never leak internals, stack traces, SQL or secrets.
 */

export type Ctx = { params: Promise<Record<string, string>> };

/**
 * CSRF: SameSite=lax cookies plus a double-submit token. The token lives in a
 * JS-readable cookie; a write must echo it back in the `x-csrf-token` header.
 * Cross-origin pages cannot read it, and middleware additionally rejects any
 * cross-origin non-GET request. When a session exists, its bound token must also
 * match, so a stolen cookie alone is not enough to act as that user.
 */
export function verifyCsrfDoubleSubmit(req: Request, sessionToken?: string): boolean {
  const header = req.headers.get(CSRF_HEADER) ?? '';
  const cookie = readCookie(req, 'kb_csrf') ?? '';
  if (header.length < 16 || cookie.length < 16) return false;
  if (header !== cookie) return false;
  if (sessionToken && header !== sessionToken) return false;
  return true;
}

export function readCookie(req: Request, name: string): string | null {
  const raw = req.headers.get('cookie') ?? '';
  for (const part of raw.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

export function ipHashFrom(req: Request): string {
  const h = req.headers;
  const fwd = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '';
  const ip = fwd || h.get('x-real-ip') || 'unknown';
  return hashToken(`ip|${ip}`).slice(0, 20);
}

export function jsonError(status: number, message: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

export async function handler(
  req: Request,
  opts: {
    method?: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';
    csrf?: boolean;
    rate?: { rule: RateRuleKey; scope: (ctx: { user: AuthenticatedUser | null; req: Request }) => string };
    admin?: boolean;
    run: (ctx: { user: AuthenticatedUser | null; req: Request }) => Promise<Response> | Response;
  },
): Promise<Response> {
  try {
    const user = await readUser();
    if (opts.admin && (!user || (user.role !== 'admin' && user.role !== 'staff'))) {
      return jsonError(user ? 403 : 401, user ? 'You do not have access to this area.' : 'Please sign in to continue.');
    }
    const mutating = (opts.method ?? 'POST') !== 'GET';
    if (mutating && opts.csrf !== false && !verifyCsrfDoubleSubmit(req, user?.csrfToken)) {
      return jsonError(403, 'Your session could not be verified for this action. Please refresh the page and try again.');
    }
    if (opts.rate) {
      const scope = opts.rate.scope({ user, req });
      const res = consume(opts.rate.rule, scope);
      if (!res.ok) {
        return jsonError(429, 'Too many attempts — please slow down and try again shortly.', {
          retry_after_seconds: res.retryAfterSeconds,
        });
      }
    }
    return await opts.run({ user, req });
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json(
        { error: err.publicMessage, code: err.code, ...(err.fieldErrors ? { fieldErrors: err.fieldErrors } : {}) },
        { status: err.status },
      );
    }
    // Unknown failures: log a stable, non-sensitive line; never leak internals to the client.
    console.error('[api] unhandled_error', err instanceof Error ? err.constructor.name : typeof err);
    return jsonError(500, 'Something went wrong on our side. Please try again.');
  }
}

/**
 * Route-level admin guard that never throws.
 *
 * Every admin route needs the acting user *before* `handler()` runs, because the rate-limit
 * scope and the audit actor are built from it. A plain `await requireAdminUser()` there
 * escapes the handler's error shaping, so an unauthenticated request surfaced as an
 * unhandled 500 with a stack trace in the log instead of a clean 401. This returns either
 * the admin or a response to hand straight back.
 */
export async function guardAdmin(): Promise<{ ok: true; admin: NonNullable<Awaited<ReturnType<typeof requireAdminUser>>> } | { ok: false; res: Response }> {
  try {
    return { ok: true as const, admin: await requireAdminUser() };
  } catch (err) {
    const status = err instanceof AppError ? err.status : 401;
    const message = err instanceof AppError ? err.publicMessage : 'Please sign in to continue.';
    return { ok: false as const, res: jsonError(status, message) };
  }
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const ct = req.headers.get('content-type') ?? '';
    if (ct.includes('application/x-www-form-urlencoded')) {
      const text = await req.text();
      return Object.fromEntries(new URLSearchParams(text).entries());
    }
    const body = await req.json();
    return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function parseForm(req: Request): Promise<Record<string, string>> {
  return req.formData().then((fd) => {
    const out: Record<string, string> = {};
    for (const [k, v] of fd.entries()) if (typeof v === 'string') out[k] = v;
    return out;
  });
}
