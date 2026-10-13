import { NextResponse } from 'next/server';
import { guardAdmin, handler, readJson } from '@/lib/api.ts';
import { requireAdminUser } from '@/lib/session.ts';
import { AppError } from '@/lib/errors.ts';
import { upsertCoupon } from '@/domain/pricing.ts';
import { recordAudit } from '@/domain/audit.ts';
import { get, run } from '@/db/client.ts';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  code: z.string().trim().min(3).max(40),
  kind: z.enum(['percent', 'fixed']),
  value: z.coerce.number().int().min(0).max(1_000_000),
  minSubtotalCents: z.coerce.number().int().min(0).default(0),
  maxDiscountCents: z.coerce.number().int().min(0).nullable().optional(),
  usageLimit: z.coerce.number().int().min(1).nullable().optional(),
  perUserLimit: z.coerce.number().int().min(1).nullable().optional(),
  startsAt: z.string().nullable().optional(),
  endsAt: z.string().nullable().optional(),
  active: z.coerce.boolean().default(true),
  isSample: z.coerce.boolean().default(false),
});

export async function POST(req: Request) {
  const gate = await guardAdmin();
  if (!gate.ok) return gate.res;
  const admin = gate.admin;
  const body = await readJson(req);
  return handler(req, {
    method: 'POST',
    admin: true,
    run: async () => {
      const parsed = schema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Check the coupon fields.', fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join('.'), i.message])) },
          { status: 400 },
        );
      }
      if (parsed.data.kind === 'percent') parsed.data.value = Math.round(parsed.data.value);
      const res = upsertCoupon({ ...parsed.data, value: parsed.data.kind === 'percent' ? parsed.data.value * 100 : parsed.data.value });
      recordAudit({
        action: 'coupon.upsert',
        targetType: 'coupon',
        targetId: parsed.data.code,
        actorUserId: admin.id,
        actorRole: admin.role,
        summary: `${parsed.data.active ? 'Active' : 'Inactive'} ${parsed.data.kind} coupon ${parsed.data.code}${parsed.data.isSample ? ' [sample]' : ''}`,
      });
      return NextResponse.json({ ok: true, id: res.id });
    },
  });
}

export async function DELETE(req: Request) {
  const gate = await guardAdmin();
  if (!gate.ok) return gate.res;
  const admin = gate.admin;
  return handler(req, {
    method: 'DELETE',
    admin: true,
    run: async () => {
      const code = (new URL(req.url).searchParams.get('code') ?? '').toUpperCase();
      const row = get<{ id: number; used_count: number }>('SELECT id, used_count FROM coupons WHERE code = ?', [code]);
      if (!row) return NextResponse.json({ error: 'Unknown coupon.' }, { status: 404 });
      if (row.used_count > 0) {
        run('UPDATE coupons SET active = 0, updated_at = ? WHERE id = ?', [new Date().toISOString(), row.id]);
        recordAudit({
          action: 'coupon.deactivate',
          targetType: 'coupon',
          targetId: code,
          actorUserId: admin.id,
          actorRole: admin.role,
          summary: 'Deactivated (redemptions exist, so the record was kept)',
        });
        return NextResponse.json({ ok: true, deactivated: true });
      }
      run('DELETE FROM coupons WHERE id = ?', [row.id]);
      recordAudit({ action: 'coupon.delete', targetType: 'coupon', targetId: code, actorUserId: admin.id, actorRole: admin.role, summary: 'Deleted unused coupon' });
      return NextResponse.json({ ok: true, deleted: true });
    },
  });
}
