import { NextResponse } from 'next/server';
import { guardAdmin, handler, readJson } from '@/lib/api.ts';
import { requireAdminUser } from '@/lib/session.ts';
import { createShipment } from '@/adapters/shipping.ts';
import { AppError } from '@/lib/errors.ts';
import { get, run } from '@/db/client.ts';
import { recordAudit } from '@/domain/audit.ts';

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
    run: async () => {
      const orderId = Number(body.orderId);
      if (!Number.isInteger(orderId)) throw new AppError('validation_error', 'Unknown order.', 400);
      if (body.action === 'manual_tracking') {
        const tracking = String(body.trackingNumber ?? '').trim().slice(0, 60);
        const courier = String(body.courier ?? '').trim().slice(0, 60);
        if (!tracking) throw new AppError('validation_error', 'Enter the courier’s real tracking reference.', 400);
        const order = get<{ id: number; order_number: string }>('SELECT id, order_number FROM orders WHERE id = ?', [orderId]);
        if (!order) throw new AppError('not_found', 'Order not found.', 404);
        const ts = new Date().toISOString();
        run(
          `INSERT INTO shipments (order_id, provider, provider_mode, tracking_number, courier, service, status, created_at, updated_at)
           VALUES (?, 'manual', 'live', ?, ?, 'owner-entered', 'label_created', ?, ?)`,
          [orderId, tracking, courier || 'Manual entry', ts, ts],
        );
        recordAudit({
          action: 'shipment.manual_tracking',
          targetType: 'order',
          targetId: order.order_number,
          actorUserId: admin.id,
          actorRole: admin.role,
          summary: `Tracking reference entered manually by staff (${courier || 'unspecified courier'})`,
        });
        return NextResponse.json({ ok: true, mode: 'live' });
      }
      const res = createShipment(orderId, { userId: admin.id, role: admin.role });
      return NextResponse.json(res, { status: 201 });
    },
  });
}
