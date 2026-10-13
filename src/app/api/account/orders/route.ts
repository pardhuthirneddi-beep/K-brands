import { NextResponse } from 'next/server';
import { handler, ipHashFrom, readJson } from '@/lib/api.ts';
import { readUser } from '@/lib/session.ts';
import { cancelSchema, parseWith } from '@/lib/validation.ts';
import { AppError } from '@/lib/errors.ts';
import { requestCancellation } from '@/domain/orders.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const user = await readUser();
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const body = await readJson(req);
  return handler(req, {
    method: 'POST',
    rate: { rule: 'return_request', scope: () => `cancel:${user.id}` },
    run: async () => {
      const parsed = parseWith(cancelSchema, body);
      if (!parsed.ok) throw new AppError('validation_error', parsed.message, 400, parsed.fieldErrors);
      const res = requestCancellation({
        orderNumber: parsed.value.orderNumber,
        userId: user.id,
        reason: parsed.value.reason,
        detail: parsed.value.detail,
        ip: ipHashFrom(req),
      });
      return NextResponse.json(res, { status: res.status === 'requested' ? 202 : 409 });
    },
  });
}
