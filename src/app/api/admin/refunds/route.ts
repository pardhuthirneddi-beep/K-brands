import { NextResponse } from 'next/server';
import { guardAdmin, handler, readJson } from '@/lib/api.ts';
import { requireAdminUser } from '@/lib/session.ts';
import { initiateRefund } from '@/adapters/payment.ts';
import { recordAudit } from '@/domain/audit.ts';
import { AppError } from '@/lib/errors.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const gate = await guardAdmin();
  if (!gate.ok) return gate.res;
  const admin = gate.admin;
  const body = await readJson(req);
  return handler(req, {
    method: 'POST',
    admin: true,
    rate: { rule: 'admin_mutation', scope: () => `refund:${admin.id}` },
    run: async () => {
      const orderId = Number(body.orderId);
      const amountCents = Number(body.amountCents);
      const reason = String(body.reason ?? '').slice(0, 300);
      if (!Number.isInteger(orderId) || !Number.isInteger(amountCents) || amountCents <= 0) {
        throw new AppError('validation_error', 'Provide an order and a positive refund amount in paise.', 400);
      }
      if (!reason) throw new AppError('validation_error', 'A refund needs a written reason for the audit trail.', 400);
      const res = initiateRefund({ orderId, amountCents, reason, actorUserId: admin.id, actorRole: admin.role });
      recordAudit({
        action: 'refund.initiate',
        targetType: 'order',
        targetId: String(orderId),
        actorUserId: admin.id,
        actorRole: admin.role,
        summary: `Refund ${String(amountCents)} paise → ${res.status}`,
      });
      return NextResponse.json({ ok: true, ...res });
    },
  });
}
