import { NextResponse } from 'next/server';
import { handler, readJson } from '@/lib/api.ts';
import { createSession, registerCustomer } from '@/domain/auth.ts';
import { recordAudit } from '@/domain/audit.ts';
import { registerSchema, parseWith } from '@/lib/validation.ts';
import { AppError } from '@/lib/errors.ts';
import { cookieOptionsFor, cartCookieOptionsFor, SESSION_COOKIE, newCartKey } from '@/lib/session.ts';
import { attachCartUser, mergeCarts } from '@/domain/cart.ts';
import { consume } from '@/lib/rate-limit.ts';
import { ipHashFrom } from '@/lib/api.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const body = await readJson(req);
  const ip = ipHashFrom(req);
  const limit = consume('signup', ip);
  if (!limit.ok) {
    return NextResponse.json({ error: 'Too many sign-up attempts. Please try again shortly.' }, { status: 429 });
  }
  return handler(req, {
    method: 'POST',
    csrf: false,
    run: async () => {
      const parsed = parseWith(registerSchema, body);
      if (!parsed.ok) throw new AppError('validation_error', parsed.message, 400, parsed.fieldErrors);
      const { email, password, fullName, phone } = parsed.value;
      const { user } = registerCustomer({ email, password, fullName, phone: phone || null });
      const session = createSession(user.id, { ip: null, userAgent: req.headers.get('user-agent') });
      const cartKey = req.headers.get('cookie')?.match(/kb_cart=([^;]+)/)?.[1];
      let merged = false;
      if (cartKey) {
        mergeCarts(cartKey, `user:${user.id}`);
        attachCartUser(`user:${user.id}`, user.id);
        merged = true;
      }
      recordAudit({
        action: 'auth.register',
        targetType: 'user',
        targetId: user.id,
        actorUserId: user.id,
        actorRole: 'customer',
        summary: `Account created for ${user.email}`,
        ip,
      });
      const res = NextResponse.json(
        { ok: true, user: { email: user.email, fullName: user.full_name, role: user.role }, merged },
        { status: 201 },
      );
      res.cookies.set(SESSION_COOKIE, session.token, cookieOptionsFor(req));
      res.cookies.set('kb_csrf', session.csrfToken, cookieOptionsFor(req, { httpOnly: false }));
      if (!merged) res.cookies.set('kb_cart', newCartKey(), cartCookieOptionsFor(req));
      return res;
    },
  });
}
