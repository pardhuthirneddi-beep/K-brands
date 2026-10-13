import { NextResponse } from 'next/server';
import { handler, ipHashFrom } from '@/lib/api.ts';
import { authenticate, createSession } from '@/domain/auth.ts';
import { demoOwnerAccessEnabled } from '@/lib/env.ts';
import { recordAudit } from '@/domain/audit.ts';
import { SESSION_COOKIE, cookieOptionsFor } from '@/lib/session.ts';
import { mergeCarts, attachCartUser } from '@/domain/cart.ts';
import { AppError } from '@/lib/errors.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/*
 * One-click owner access for a demo deployment, requested so an evaluator can reach the dashboard
 * without being handed a password out of band. Read the gate before anything else:
 *
 *   demoOwnerAccessEnabled = the demo catalogue is on AND live commerce is off
 *
 * so the moment this becomes a real shop the route stops existing (404, like any unknown path) —
 * there is nothing to forget to switch off. It is not a bypass either: it authenticates with the same
 * bootstrap credentials from the environment, through the same `authenticate()` the sign-in form uses,
 * creates a normal session, and is audited. The credentials are never in this file, in the HTML, or in
 * a query string - which is why the shopper-facing page only has a button and not a prefilled form.
 */
export async function POST(req: Request) {
  if (!demoOwnerAccessEnabled) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }
  const ip = ipHashFrom(req);
  return handler(req, {
    method: 'POST',
    csrf: false,
    // The same bucket as a real sign-in, so this cannot be used to brute force anything: it does not
    // accept input, but it does create sessions, and that is worth throttling.
    rate: { rule: 'login', scope: () => `demo-owner|${ip}` },
    run: async () => {
      const email = process.env.KBRANDS_BOOTSTRAP_ADMIN_EMAIL?.trim();
      const password = process.env.KBRANDS_BOOTSTRAP_ADMIN_PASSWORD;
      if (!email || !password) {
        throw new AppError('feature_disabled', 'This build has no demo owner account configured.');
      }

      const attempt = authenticate({ email, password, subject: ip });
      if (!attempt.ok) {
        recordAudit({
          action: 'auth.demo_owner_failed',
          targetType: 'user',
          targetId: null,
          summary: 'Demo owner sign-in failed — the bootstrap account no longer matches the environment.',
          ip,
        });
        // Never echo the reason a demo login failed: it is the same reason a real one would be.
        throw new AppError('unauthorized', 'The demo owner account is not available on this build.');
      }

      // The shortcut is for the *owner* area, so it must not become a way to sign in as whichever
      // account the bootstrap variables happen to name. A mis-set KBRANDS_BOOTSTRAP_ADMIN_EMAIL that
      // points at a shopper would otherwise hand out a customer session from a button labelled
      // "owner dashboard".
      if (attempt.user.role !== 'admin') {
        recordAudit({
          action: 'auth.demo_owner_refused',
          targetType: 'user',
          targetId: attempt.user.id,
          actorUserId: attempt.user.id,
          actorRole: attempt.user.role,
          summary: 'Demo shortcut refused: the bootstrap account is not an admin',
          ip,
        });
        throw new AppError('forbidden', 'The demo shortcut opens the owner area, and this build’s bootstrap account is not an owner account.');
      }

      const session = createSession(attempt.user.id, { userAgent: req.headers.get('user-agent') });
      const cartKey = req.headers.get('cookie')?.match(/kb_cart=([^;]+)/)?.[1];
      if (cartKey) {
        mergeCarts(cartKey, `user:${attempt.user.id}`);
        attachCartUser(`user:${attempt.user.id}`, attempt.user.id);
      }
      recordAudit({
        action: 'auth.demo_owner_login',
        targetType: 'user',
        targetId: attempt.user.id,
        actorUserId: attempt.user.id,
        actorRole: attempt.user.role,
        summary: 'Opened the owner area through the demo shortcut',
        ip,
      });

      // A form post gets a redirect (no JS needed); a fetch gets the payload and decides itself.
      const wantsHtml = (req.headers.get('content-type') ?? '').includes('form');
      const res = wantsHtml
        ? new NextResponse(null, { status: 302, headers: { Location: '/admin' } })
        : NextResponse.json({ ok: true, next: '/admin', user: { email: attempt.user.email, role: attempt.user.role } });
      res.cookies.set(SESSION_COOKIE, session.token, cookieOptionsFor(req));
      res.cookies.set('kb_csrf', session.csrfToken, cookieOptionsFor(req, { httpOnly: false }));
      return res;
    },
  });
}
