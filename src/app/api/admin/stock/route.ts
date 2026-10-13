import { NextResponse } from 'next/server';
import { guardAdmin, handler, readJson } from '@/lib/api.ts';
import { requireAdminUser } from '@/lib/session.ts';
import { AppError } from '@/lib/errors.ts';
import { adjustStock } from '@/domain/inventory.ts';
import { upsertVariant } from '@/domain/catalog.ts';
import { recordAudit } from '@/domain/audit.ts';
import { adminVariantSchema, parseWith } from '@/lib/validation.ts';

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
    rate: { rule: 'admin_mutation', scope: () => `stock:${admin.id}` },
    run: async () => {
      if (typeof body.sku === 'string' && body.sku) {
        const parsed = parseWith(adminVariantSchema, body);
        if (!parsed.ok) throw new AppError('validation_error', parsed.message, 400, parsed.fieldErrors);
        const v = parsed.value;
        const res = upsertVariant({
          productSlug: v.productSlug,
          sku: v.sku,
          size: v.size ?? null,
          colorName: v.colorName ?? null,
          priceCents: v.priceCents ?? null,
          stockQty: v.stockQty,
          status: v.status,
        });
        recordAudit({
          action: 'catalog.variant_upsert',
          targetType: 'variant',
          targetId: res.id,
          actorUserId: admin.id,
          actorRole: admin.role,
          summary: `Variant ${v.sku} set to stock ${String(v.stockQty)}`,
        });
        return NextResponse.json({ ok: true, id: res.id });
      }
      const variantId = Number(body.variantId);
      const delta = Number(body.delta);
      const note = String(body.note ?? '').slice(0, 200);
      if (!Number.isInteger(variantId) || !Number.isInteger(delta) || delta === 0) {
        throw new AppError('validation_error', 'Provide a variant and a non-zero integer adjustment.', 400);
      }
      const res = adjustStock(variantId, delta, admin.id, note || 'manual adjustment');
      recordAudit({
        action: 'inventory.adjust',
        targetType: 'variant',
        targetId: variantId,
        actorUserId: admin.id,
        actorRole: admin.role,
        summary: `${delta > 0 ? '+' : ''}${String(delta)} units → ${String(res.stock_qty)} on hand (${note || 'no note'})`,
      });
      return NextResponse.json({ ok: true, stock_qty: res.stock_qty });
    },
  });
}
