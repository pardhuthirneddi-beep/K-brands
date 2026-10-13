import { NextResponse } from 'next/server';
import { handler, ipHashFrom, readJson } from '@/lib/api.ts';
import { beginPasswordReset, consumePasswordResetToken } from '@/domain/auth.ts';
import { enqueueNotification } from '@/domain/notifications.ts';
import { recordAudit } from '@/domain/audit.ts';
import { AppError } from '@/lib/errors.ts';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const requestSchema = z.object({ email: z.string().trim().email().max(180) });
const confirmSchema = z.object({ token: z.string().min(10).max(200), password: z.string().min(10).max(200) });

export async function POST(req: Request) {
  const body = await readJson(req);
  const ip = ipHashFrom(req);
  return handler(req, {
    method: 'POST',
    csrf: false,
    rate: { rule: 'password_reset', scope: () => `reset:${ip}` },
    run: async () => {
      if (typeof body.token === 'string' && body.token.length > 0) {
        const parsed = confirmSchema.safeParse(body);
        if (!parsed.success) throw new AppError('validation_error', 'Check the new password and try again.', 400);
        consumePasswordResetToken(parsed.data.token, parsed.data.password);
        recordAudit({
          action: 'auth.password_reset_completed',
          targetType: 'user',
          targetId: null,
          summary: 'Password reset completed; all sessions revoked',
          ip,
        });
        return NextResponse.json({ ok: true, message: 'Your password has been changed. Please sign in again.' });
      }
      const parsed = requestSchema.safeParse(body);
      if (!parsed.success) throw new AppError('validation_error', 'Enter a valid email address.', 400);
      const { token } = beginPasswordReset(parsed.data.email);
      if (token) {
        // Delivery depends on the email transport; the queue records the honest status.
        enqueueNotification({
          template: 'password_reset',
          recipient: parsed.data.email,
          dedupeKey: `password_reset:${token.slice(0, 12)}`,
          subject: 'Reset your K-brands password',
          bodyText: `Use this link within 45 minutes to choose a new password:\n${process.env.KBRANDS_SITE_URL ?? ''}/account/reset-password?token=${token}\n\nIf you did not ask for this, you can ignore it.`,
          relatedType: 'user',
        });
        recordAudit({
          action: 'auth.password_reset_requested',
          targetType: 'user',
          targetId: null,
          summary: 'Password reset requested (link queued for delivery)',
          ip,
        });
      }
      // Same response whether or not the account exists — no enumeration.
      return NextResponse.json({
        ok: true,
        message: 'If an account exists for that address, we have sent a link to reset the password.',
      });
    },
  });
}
