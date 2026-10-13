import { NextResponse } from 'next/server';
import { guardAdmin, handler, readJson } from '@/lib/api.ts';
import { requireAdminUser } from '@/lib/session.ts';
import { AppError } from '@/lib/errors.ts';
import { advanceReturn, approveRefundForReturn, completeReturnRefund, decideReturn } from '@/domain/returns.ts';
import { initiateRefund } from '@/adapters/payment.ts';
import { recordAudit } from '@/domain/audit.ts';
import { get } from '@/db/client.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await guardAdmin();
  if (!gate.ok) return gate.res;
  const admin = gate.admin;
  const { id } = await ctx.params;
  const returnId = Number(id);
  if (!Number.isInteger(returnId) || returnId <= 0) return NextResponse.json({ error: 'Unknown return.' }, { status: 404 });
  const body = await readJson(req);
  return handler(req, {
    method: 'POST',
    admin: true,
    run: async () => {
      const action = String(body.action ?? '');
      if (action === 'approve' || action === 'reject') {
        decideReturn(returnId, action === 'approve' ? 'approve' : 'reject', { userId: admin.id, role: admin.role }, String(body.note ?? '') || undefined);
        return NextResponse.json({ ok: true, action });
      }
      if (['received', 'inspection_pending', 'inspected_pass', 'inspected_fail', 'close', 'pickup_scheduled', 'in_transit'].includes(action)) {
        const res = advanceReturn(returnId, action as never, { userId: admin.id, role: admin.role });
        return NextResponse.json({ ok: true, status: res.status });
      }
      if (action === 'approve_refund') {
        const amount = Number(body.amountCents);
        if (!Number.isInteger(amount) || amount <= 0) throw new AppError('validation_error', 'Provide a positive refund amount in paise.', 400);
        const res = approveRefundForReturn(returnId, amount, { userId: admin.id, role: admin.role });
        return NextResponse.json({ ok: true, ...res });
      }
      if (action === 'issue_refund') {
        const ret = get<{ order_id: number; approved_refund_cents: number | null; reference: string; status: string }>(
          'SELECT order_id, approved_refund_cents, reference, status FROM returns WHERE id = ?',
          [returnId],
        );
        if (!ret) throw new AppError('not_found', 'Unknown return.', 404);
        if (ret.status !== 'refund_pending' || ret.approved_refund_cents == null) {
          throw new AppError('state_conflict', 'A refund can only be issued after it has been approved on the return record.', 409);
        }
        const res = initiateRefund({
          orderId: ret.order_id,
          amountCents: ret.approved_refund_cents,
          reason: `Return ${ret.reference}`,
          actorUserId: admin.id,
          actorRole: admin.role,
        });
        // The provider confirmed the money went out, so the return record closes here —
        // otherwise it sits in “awaiting issue” forever and inflates the open-refunds KPI.
        const closed = res.status === 'issued';
        if (closed) completeReturnRefund(returnId, { userId: admin.id, role: admin.role });
        return NextResponse.json({ ok: true, ...res, returnClosed: closed });
      }
      throw new AppError('validation_error', 'Unknown return action.', 400);
    },
  });
}
