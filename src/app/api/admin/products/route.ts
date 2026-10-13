import { NextResponse } from 'next/server';
import { guardAdmin, handler, readJson } from '@/lib/api.ts';
import { requireAdminUser } from '@/lib/session.ts';
import { adminProductSchema, parseWith } from '@/lib/validation.ts';
import { AppError } from '@/lib/errors.ts';
import { upsertProduct } from '@/domain/catalog.ts';
import { recordAudit } from '@/domain/audit.ts';
import { get, run, transaction } from '@/db/client.ts';
import * as env from '@/lib/env.ts';

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
    rate: { rule: 'admin_mutation', scope: () => `admin:${admin.id}` },
    run: async () => {
      const parsed = parseWith(adminProductSchema, body);
      if (!parsed.ok) throw new AppError('validation_error', parsed.message, 400, parsed.fieldErrors);
      const v = parsed.value;
      const res = upsertProduct(
        {
          slug: v.slug,
          title: v.title,
          subtitle: v.subtitle ?? null,
          description: v.description ?? null,
          price_cents: v.priceCents,
          compare_at_price_cents: v.compareAtCents ?? null,
          status: v.status,
          is_sample: v.isSample ? 1 : 0,
          tax_bps: v.taxBps,
          fabric: v.fabric ?? null,
          fit: v.fit ?? null,
          garment_type: v.garmentType ?? null,
          actorUserId: admin.id,
          category_slug: v.categorySlug ?? null,
        } as never,
        { isProduction: env.isProduction },
      );
      recordAudit({
        action: 'catalog.product_upsert',
        targetType: 'product',
        targetId: v.slug,
        actorUserId: admin.id,
        actorRole: admin.role,
        summary: `${v.status}${v.isSample ? ' (sample)' : ' (verified)'} — ${v.title}`,
      });
      return NextResponse.json({ ok: true, id: res.id, slug: v.slug });
    },
  });
}

/** Archive (soft delete). We never hard-delete a product that has order history. */
export async function DELETE(req: Request) {
  const gate = await guardAdmin();
  if (!gate.ok) return gate.res;
  const admin = gate.admin;
  return handler(req, {
    method: 'DELETE',
    admin: true,
    run: async () => {
      const slug = new URL(req.url).searchParams.get('slug') ?? '';
      return transaction(() => {
        const row = get<{ id: number; title: string }>('SELECT id, title FROM products WHERE slug = ?', [slug]);
        if (!row) throw new AppError('not_found', 'Unknown product.', 404);
        const ordered =
          get<{ n: number }>('SELECT COUNT(*) AS n FROM order_lines WHERE product_id = ?', [row.id])?.n ?? 0;
        if (ordered > 0) {
          run("UPDATE products SET status = 'archived', updated_at = ? WHERE id = ?", [new Date().toISOString(), row.id]);
          recordAudit({
            action: 'catalog.product_archive',
            targetType: 'product',
            targetId: slug,
            actorUserId: admin.id,
            actorRole: admin.role,
            summary: `Archived ${row.title} (${String(ordered)} historical order line(s) preserved)`,
          });
          return NextResponse.json({ ok: true, archived: true });
        }
        run('DELETE FROM products WHERE id = ?', [row.id]);
        recordAudit({
          action: 'catalog.product_delete',
          targetType: 'product',
          targetId: slug,
          actorUserId: admin.id,
          actorRole: admin.role,
          summary: `Deleted unreferenced product ${row.title}`,
        });
        return NextResponse.json({ ok: true, deleted: true });
      });
    },
  });
}

export async function PUT(req: Request) {
  const gate = await guardAdmin();
  if (!gate.ok) return gate.res;
  const admin = gate.admin;
  const body = await readJson(req);
  return handler(req, {
    method: 'PUT',
    admin: true,
    run: async () => {
      const slug = String(body.slug ?? '');
      const status = String(body.status ?? '');
      if (!['draft', 'published', 'archived', 'out_of_stock'].includes(status)) {
        throw new AppError('validation_error', 'Unknown status.', 400);
      }
      const row = get<{ id: number; is_sample: number; title: string }>('SELECT id, is_sample, title FROM products WHERE slug = ?', [slug]);
      if (!row) throw new AppError('not_found', 'Unknown product.', 404);
      if (status === 'published' && row.is_sample === 1 && env.isProduction && !env.demoCatalogueEnabled) {
        // Production safeguard, again at the boundary that flips visibility.
        throw new AppError(
          'policy_not_configured',
          'Sample catalogue records cannot be published to the live store. Convert this record to verified product data first.',
          503,
        );
      }
      run('UPDATE products SET status = ?, updated_at = ?, published_at = COALESCE(published_at, ?) WHERE id = ?', [
        status,
        new Date().toISOString(),
        status === 'published' ? new Date().toISOString() : null,
        row.id,
      ]);
      if (status === 'published') run('UPDATE variants SET status = ? WHERE product_id = ?', ['active', row.id]);
      if (status === 'archived') run('UPDATE variants SET status = ? WHERE product_id = ?', ['inactive', row.id]);
      recordAudit({
        action: `catalog.product_${status}`,
        targetType: 'product',
        targetId: slug,
        actorUserId: admin.id,
        actorRole: admin.role,
        summary: `${row.title} → ${status}${row.is_sample === 1 ? ' [sample record]' : ''}`,
      });
      return NextResponse.json({ ok: true, status });
    },
  });
}
