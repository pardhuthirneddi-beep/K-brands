import { NextResponse } from 'next/server';
import { handler } from '@/lib/api.ts';
import { revokeSession } from '@/domain/auth.ts';
import { readUser } from '@/lib/session.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  return handler(req, {
    method: 'POST',
    run: async () => {
      const user = await readUser();
      if (user) revokeSession(user.sessionId);
      const res = NextResponse.json({ ok: true });
      res.cookies.set('kb_session', '', { path: '/', maxAge: 0 });
      res.cookies.set('kb_csrf', '', { path: '/', maxAge: 0, httpOnly: false });
      return res;
    },
  });
}
