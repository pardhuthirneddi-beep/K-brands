import { NextResponse } from 'next/server';
import { handler, readJson } from '@/lib/api.ts';
import { addressSchema, parseWith } from '@/lib/validation.ts';
import { all, get, run, transaction } from '@/db/client.ts';
import { AppError } from '@/lib/errors.ts';
import { readUser } from '@/lib/session.ts';
import { INDIAN_STATES } from '@/domain/constants.ts';
import { recordAudit } from '@/domain/audit.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const now = () => new Date().toISOString();

export async function GET() {
  const user = await readUser();
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const rows = all('SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default_shipping DESC, id DESC', [user.id]);
  return NextResponse.json({ addresses: rows });
}

export async function POST(req: Request) {
  const user = await readUser();
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const body = await readJson(req);
  return handler(req, {
    method: 'POST',
    run: async () => {
      const parsed = parseWith(addressSchema, body);
      if (!parsed.ok) throw new AppError('validation_error', parsed.message, 400, parsed.fieldErrors);
      const a = parsed.value;
      const state = INDIAN_STATES.find((s) => s.code === a.stateCode.toUpperCase())!;
      return transaction(() => {
        const idField = body.id ? Number(body.id) : null;
        const isOnly = idField === null && (get<{ n: number }>('SELECT COUNT(*) AS n FROM addresses WHERE user_id = ?', [user.id])?.n ?? 0) === 0;
        const makeDefaultShipping = a.countryCode === 'IN' ? isOnly : false;
        let id: number;
        if (idField) {
          const own = get<{ id: number }>('SELECT id FROM addresses WHERE id = ? AND user_id = ?', [idField, user.id]);
          if (!own) throw new AppError('not_found', 'We could not find that address.', 404);
          run(
            `UPDATE addresses SET label=?, recipient_name=?, phone=?, line1=?, line2=?, locality=?, city=?, state_code=?,
             state_name=?, pincode=?, country_code=?, updated_at=? WHERE id=? AND user_id=?`,
            [a.recipientName.slice(0, 60) || 'Home', a.recipientName, a.phone, a.line1, a.line2 ?? null, a.locality ?? null,
             a.city, state.code, state.name, a.pincode, a.countryCode ?? 'IN', now(), idField, user.id],
          );
          id = idField;
        } else {
          id = run(
            `INSERT INTO addresses (user_id, label, recipient_name, phone, line1, line2, locality, city, state_code,
                state_name, pincode, country_code, is_default_shipping, is_default_billing, created_at, updated_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [user.id, 'Home', a.recipientName, a.phone, a.line1, a.line2 ?? null, a.locality ?? null, a.city, state.code,
             state.name, a.pincode, a.countryCode ?? 'IN', makeDefaultShipping ? 1 : 0, makeDefaultShipping ? 1 : 0, now(), now()],
          ).lastInsertRowid;
        }
        if (body.setDefault === true) {
          run('UPDATE addresses SET is_default_shipping = 0 WHERE user_id = ?', [user.id]);
          run('UPDATE addresses SET is_default_shipping = 1 WHERE id = ? AND user_id = ?', [id, user.id]);
        }
        recordAudit({
          action: idField ? 'address.update' : 'address.create',
          targetType: 'address',
          targetId: id,
          actorUserId: user.id,
          actorRole: 'customer',
          summary: idField ? 'Saved address changes' : 'Added an address',
        });
        return NextResponse.json({ ok: true, id, address: get('SELECT * FROM addresses WHERE id = ?', [id]) });
      });
    },
  });
}

export async function DELETE(req: Request) {
  const user = await readUser();
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  return handler(req, {
    method: 'DELETE',
    run: async () => {
      const id = Number(new URL(req.url).searchParams.get('id'));
      if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Unknown address.' }, { status: 400 });
      const res = run('DELETE FROM addresses WHERE id = ? AND user_id = ?', [id, user.id]);
      if (res.changes === 0) return NextResponse.json({ error: 'We could not find that address.' }, { status: 404 });
      recordAudit({ action: 'address.delete', targetType: 'address', targetId: id, actorUserId: user.id, actorRole: 'customer', summary: 'Removed a saved address' });
      return NextResponse.json({ ok: true });
    },
  });
}
