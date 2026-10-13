import { NextResponse } from 'next/server';
import { handler, ipHashFrom, readJson } from '@/lib/api.ts';
import { authenticate, createSession } from '@/domain/auth.ts';
import { recordAudit } from '@/domain/audit.ts';
import { loginSchema, parseWith } from '@/lib/validation.ts';
import { AppError } from '@/lib/errors.ts';
import { SESSION_COOKIE, cookieOptionsFor } from '@/lib/session.ts';
import { attachCartUser, mergeCarts } from '@/domain/cart.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const body = await readJson(req);
  const ip = ipHashFrom(req);
  const email = typeof body.email === 'string' ? body.email : 'unknown';
  return handler(req, {
    method: 'POST',
    csrf: false,
    rate: { rule: 'login', scope: () => `${ip}|${String(email).toLowerCase().slice(0, 60)}` },
    run: async () => {
      const parsed = parseWith(loginSchema, body);
      if (!parsed.ok) throw new AppError('validation_error', parsed.message, 400, parsed.fieldErrors);
      const attempt = authenticate({ email: parsed.value.email, password: parsed.value.password, subject: ip });
      if (!attempt.ok) {
        recordAudit({
          action: 'auth.login_failed',
          targetType: 'user',
          targetId: null,
          summary: `Failed sign-in attempt for ${parsed.value.email.toLowerCase()}`,
          ip,
        });
        throw new AppError('unauthorized', attempt.message, 401);
      }
      const session = createSession(attempt.user.id, { userAgent: req.headers.get('user-agent') });
      const cartKey = req.headers.get('cookie')?.match(/kb_cart=([^;]+)/)?.[1];
      if (cartKey) {
        mergeCarts(cartKey, `user:${attempt.user.id}`);
        attachCartUser(`user:${attempt.user.id}`, attempt.user.id);
      }
      recordAudit({
        action: 'auth.login',
        targetType: 'user',
        targetId: attempt.user.id,
        actorUserId: attempt.user.id,
        actorRole: attempt.user.role,
        summary: `Signed in as ${attempt.user.email}`,
        ip,
      });
      const res = NextResponse.json({
        ok: true,
        user: { email: attempt.user.email, fullName: attempt.user.full_name, role: attempt.user.role },
        next: attempt.user.role === 'admin' ? '/admin' : '/account',
      });
      res.cookies.set(SESSION_COOKIE, session.token, cookieOptionsFor(req));
      // The CSRF cookie must be replaced here, not merely created if absent: it is what the request
      // is checked against while this session lives, so a stale pre-login value fails every write.
      res.cookies.set('kb_csrf', session.csrfToken, cookieOptionsFor(req, { httpOnly: false }));
      return res;
    },
  });
}
