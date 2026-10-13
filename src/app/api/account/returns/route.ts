import { NextResponse } from 'next/server';
import { handler, ipHashFrom, readJson } from '@/lib/api.ts';
import { readUser } from '@/lib/session.ts';
import { parseWith, returnSchema } from '@/lib/validation.ts';
import { AppError } from '@/lib/errors.ts';
import { createReturnRequest } from '@/domain/returns.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const user = await readUser();
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const body = await readJson(req);
  return handler(req, {
    method: 'POST',
    rate: { rule: 'return_request', scope: () => `return:${user.id}` },
    run: async () => {
      const parsed = parseWith(returnSchema, body);
      if (!parsed.ok) throw new AppError('validation_error', parsed.message, 400, parsed.fieldErrors);
      const res = createReturnRequest({
        orderNumber: parsed.value.orderNumber,
        userId: user.id,
        orderLineId: parsed.value.orderLineId ?? null,
        type: parsed.value.type,
        reasonCode: parsed.value.reasonCode,
        detail: parsed.value.detail,
        ip: ipHashFrom(req),
      });
      return NextResponse.json(res, { status: 201 });
    },
  });
}
