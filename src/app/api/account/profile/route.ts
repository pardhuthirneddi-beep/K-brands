import { NextResponse } from 'next/server';
import { handler, readJson } from '@/lib/api.ts';
import { readUser } from '@/lib/session.ts';
import { get, run, transaction } from '@/db/client.ts';
import { recordAudit } from '@/domain/audit.ts';
import { AppError } from '@/lib/errors.ts';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  fullName: z.string().trim().min(2).max(120),
  phone: z
    .string()
    .trim()
    .regex(/^([6-9]\d{9})?$/, 'Enter a 10-digit Indian mobile number or leave it blank.'),
});

export async function POST(req: Request) {
  const user = await readUser();
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const body = await readJson(req);
  return handler(req, {
    method: 'POST',
    run: async () => {
      const parsed = schema.safeParse(body);
      if (!parsed.success) throw new AppError('validation_error', 'Check the details and try again.', 400);
      transaction(() => {
        run('UPDATE users SET full_name = ?, phone = ?, updated_at = ? WHERE id = ?', [
          parsed.data.fullName,
          parsed.data.phone || null,
          new Date().toISOString(),
          user.id,
        ]);
      });
      recordAudit({
        action: 'account.profile_update',
        targetType: 'user',
        targetId: user.id,
        actorUserId: user.id,
        actorRole: 'customer',
        summary: 'Updated name / phone on their own profile',
      });
      return NextResponse.json({
        ok: true,
        message: 'Saved.',
        user: get('SELECT id, email, full_name, phone FROM users WHERE id = ?', [user.id]),
      });
    },
  });
}
