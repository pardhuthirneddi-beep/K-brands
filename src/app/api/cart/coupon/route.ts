import { NextResponse } from 'next/server';
import { handler, readJson } from '@/lib/api.ts';
import { ensureDb } from '@/lib/bootstrap.ts';
import { cartCookieOptionsFor, CART_COOKIE, readCartKey } from '@/lib/session.ts';
import { cartKeyFor, quoteCart } from '@/domain/cart.ts';
import { applyCouponToCart } from '@/domain/pricing.ts';
import { AppError } from '@/lib/errors.ts';
import { run, get } from '@/db/client.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Discount codes are applied to the basket server-side and re-validated again at
 * checkout — a code that stops being valid between the two never silently changes
 * the price the customer was shown, it blocks the order instead.
 */
export async function POST(req: Request) {
  ensureDb();
  return handler(req, {
    method: 'POST',
    rate: { rule: 'coupon', scope: ({ user, req: r }) => `coupon:${user?.id ?? r.headers.get('cookie')?.length ?? 0}` },
    run: async ({ user, req: r }) => {
      const body = await readJson(req);
      const code = String(body.code ?? '').trim().toUpperCase();
      if (!code) throw new AppError('validation_error', 'Enter a code.', 400);
      const key = cartKeyFor(user?.id ?? null, await readCartKey(user));
      if (!key) throw new AppError('validation_error', 'Add something to your bag before using a code.', 400);
      const res = applyCouponToCart(key, code);
      const quote = quoteCart({ cartKey: key, userId: user?.id ?? null }).quote;
      const out = NextResponse.json({
        ok: res.ok,
        message: res.message,
        couponCode: quote.couponCode,
        couponDiscountCents: quote.couponDiscountCents,
        discountCents: quote.discountCents,
        totalCents: quote.totalCents,
        itemCount: quote.itemCount,
      });
      // A guest who has not yet got the cookie still needs it to keep the code.
      if (!user && !(r.headers.get('cookie') ?? '').includes(`${CART_COOKIE}=`)) {
        out.cookies.set(CART_COOKIE, key, cartCookieOptionsFor(req));
      }
      return out;
    },
  });
}

export async function DELETE(req: Request) {
  ensureDb();
  return handler(req, {
    method: 'DELETE',
    run: async ({ user }) => {
      const key = cartKeyFor(user?.id ?? null, await readCartKey(user));
      if (!key) throw new AppError('validation_error', 'Your bag is empty.', 400);
      const cart = get<{ id: number }>('SELECT id FROM carts WHERE key = ?', [key]);
      if (cart) run('UPDATE carts SET coupon_code = NULL, updated_at = ? WHERE id = ?', [new Date().toISOString(), cart.id]);
      const quote = quoteCart({ cartKey: key, userId: user?.id ?? null }).quote;
      return NextResponse.json({ ok: true, message: 'Code removed.', totalCents: quote.totalCents, discountCents: quote.discountCents });
    },
  });
}
