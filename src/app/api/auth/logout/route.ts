import { NextResponse } from 'next/server';
import { handler } from '@/lib/api.ts';
import { revokeSession } from '@/domain/auth.ts';
import { readUser, cookieOptionsFor } from '@/lib/session.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  return handler(req, {
    method: 'POST',
    run: async () => {
      const user = await readUser();
      if (user) revokeSession(user.sessionId);
      const res = NextResponse.json({ ok: true });
      // A partitioned preview cookie needs the same attributes when cleared, or it survives logout.
      res.cookies.set('kb_session', '', { ...cookieOptionsFor(req), maxAge: 0 });
      res.cookies.set('kb_csrf', '', { ...cookieOptionsFor(req, { httpOnly: false }), maxAge: 0 });
      return res;
    },
  });
}
