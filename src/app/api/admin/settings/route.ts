import { NextResponse } from 'next/server';
import { guardAdmin, handler, readJson } from '@/lib/api.ts';
import { AppError } from '@/lib/errors.ts';
import { SETTING_DEFAULTS, listSettings, readinessReport, setSetting } from '@/domain/settings.ts';
import { recordAudit } from '@/domain/audit.ts';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_KEYS = new Set(Object.keys(SETTING_DEFAULTS));

const schema = z.object({
  key: z.string().min(3).max(80),
  value: z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(z.string()), z.record(z.string(), z.unknown())]),
  clearReview: z.boolean().optional(),
});

export async function GET() {
  const gate = await guardAdmin();
  if (!gate.ok) return gate.res;
  return NextResponse.json({ settings: listSettings(), readiness: readinessReport() });
}

export async function POST(req: Request) {
  const gate = await guardAdmin();
  if (!gate.ok) return gate.res;
  const admin = gate.admin;
  const body = await readJson(req);
  return handler(req, {
    method: 'POST',
    admin: true,
    rate: { rule: 'admin_mutation', scope: () => `settings:${admin.id}` },
    run: async () => {
      const parsed = schema.safeParse(body);
      if (!parsed.success) throw new AppError('validation_error', 'Unknown setting.', 400);
      const { key, value, clearReview } = parsed.data;
      if (!ALLOWED_KEYS.has(key)) {
        throw new AppError('validation_error', 'That setting cannot be changed from this screen.', 400);
      }
      if (key.startsWith('returns.window_days') && typeof value === 'number' && (value < 0 || value > 365)) {
        throw new AppError('validation_error', 'Return window must be between 0 and 365 days.', 400);
      }
      // Writing a value and approving a value are different acts. Saving an adjacent
      // field must not quietly mark an unreviewed number as the owner's promise — the
      // storefront keeps printing “not configured yet” until the box is ticked.
      const review = clearReview ? false : (SETTING_DEFAULTS[key]?.requiresReview ?? true);
      setSetting(key, value, { actorUserId: admin.id, requiresReview: review });
      recordAudit({
        action: 'settings.update',
        targetType: 'setting',
        targetId: key,
        actorUserId: admin.id,
        actorRole: admin.role,
        summary: `${key} set to ${typeof value === 'string' ? value.slice(0, 60) : JSON.stringify(value).slice(0, 60)}${clearReview ? ' and marked approved' : ''}`,
      });
      return NextResponse.json({ ok: true, readiness: readinessReport() });
    },
  });
}
