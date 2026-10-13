import { NextResponse } from 'next/server';
import { handler, readJson } from '@/lib/api.ts';
import { readUser } from '@/lib/session.ts';
import { changePassword } from '@/domain/auth.ts';
import { recordAudit } from '@/domain/audit.ts';
import { AppError } from '@/lib/errors.ts';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const user = await readUser();
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const body = await readJson(req);
  return handler(req, {
    method: 'POST',
    run: async () => {
      const parsed = z
        .object({ currentPassword: z.string().min(1).max(200), newPassword: z.string().min(10).max(200) })
        .safeParse(body);
      if (!parsed.success) {
        throw new AppError('validation_error', 'A new password needs at least 10 characters.', 400);
      }
      const { revoked } = changePassword(user.id, parsed.data.currentPassword, parsed.data.newPassword);
      recordAudit({
        action: 'account.password_change',
        targetType: 'user',
        targetId: user.id,
        actorUserId: user.id,
        actorRole: 'customer',
        summary: `Password changed; ${String(revoked)} other session(s) revoked`,
      });
      return NextResponse.json({ ok: true, message: 'Password updated. This device stays signed in.' });
    },
  });
}
