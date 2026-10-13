import { NextResponse } from 'next/server';
import { guardAdmin, handler, readJson } from '@/lib/api.ts';
import { requireAdminUser } from '@/lib/session.ts';
import { AppError } from '@/lib/errors.ts';
import { resolveCancellation, transitionOrder, type OrderStatus } from '@/domain/orders.ts';
import { recordAudit } from '@/domain/audit.ts';
import { get, run } from '@/db/client.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED = [
  'awaiting_fulfilment',
  'packed',
  'shipped',
  'out_for_delivery',
  'delivered',
  'cancelled',
  'returns_requested',
  'returned',
] as const;

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await guardAdmin();
  if (!gate.ok) return gate.res;
  const admin = gate.admin;
  const { id } = await ctx.params;
  const orderId = Number(id);
  if (!Number.isInteger(orderId) || orderId <= 0) return NextResponse.json({ error: 'Unknown order.' }, { status: 404 });
  const body = await readJson(req);
  return handler(req, {
    method: 'POST',
    admin: true,
    rate: { rule: 'admin_mutation', scope: () => `order:${admin.id}` },
    run: async () => {
      const action = String(body.action ?? '');
      if (action === 'resolve_cancellation') {
        resolveCancellation(orderId, body.approve === true, { userId: admin.id, role: admin.role });
        return NextResponse.json({ ok: true });
      }
      if (action === 'note') {
        const note = String(body.note ?? '').slice(0, 1000);
        run('UPDATE orders SET internal_note = ?, updated_at = ? WHERE id = ?', [note, new Date().toISOString(), orderId]);
        recordAudit({
          action: 'order.note',
          targetType: 'order',
          targetId: String(orderId),
          actorUserId: admin.id,
          actorRole: admin.role,
          summary: 'Internal note updated',
        });
        return NextResponse.json({ ok: true });
      }
      if (action === 'mark_paid_manual') {
        // Deliberately refused: payment confirmation may only arrive from a verified
        // provider webhook or a server-side provider lookup.
        throw new AppError(
          'forbidden',
          'An order cannot be marked paid from the admin UI. Confirm it through the provider webhook or the payment-status check, so the amount and currency are verified.',
          403,
        );
      }
      if (!ALLOWED.includes(action as (typeof ALLOWED)[number])) {
        throw new AppError('validation_error', 'Unknown order action.', 400);
      }
      const next = transitionOrder(orderId, action as OrderStatus, {
        actorUserId: admin.id,
        actorRole: admin.role,
        detail: String(body.detail ?? '').slice(0, 200) || 'admin action',
      });
      return NextResponse.json({ ok: true, status: next });
    },
  });
}
