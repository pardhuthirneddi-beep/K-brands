import { NextResponse } from 'next/server';
import { handler, readJson, readCookie } from '@/lib/api.ts';
import { ensureDb } from '@/lib/bootstrap.ts';
import { CART_COOKIE, cartCookieOptions, readCartKey, newCartKey } from '@/lib/session.ts';
import {
  addLine,
  cartKeyFor,
  clearCart,
  getCartLines,
  loadOrCreateCart,
  quoteCart,
  removeLine,
  setQuantity,
} from '@/domain/cart.ts';
import type { Quote } from '@/domain/pricing.ts';
import { AppError } from '@/lib/errors.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Basket endpoint.
 *
 * Ownership: a signed-in basket is keyed `user:<id>`, so it can never be read or
 * written by another account; a guest basket is keyed by the `kb_cart` cookie value,
 * which is a random token the browser cannot choose for someone else. Stock is not
 * consumed here — only `reserve()` holds units while checkout is in progress.
 */

type CartLineView = {
  variantId: number;
  productId: number;
  slug: string;
  title: string;
  sku: string;
  size: string | null;
  color: string | null;
  quantity: number;
  available: number;
  unitPriceCents: number;
  compareAtCents: number | null;
  lineTotalCents: number;
  imageUrl: string | null;
  isSample: boolean;
  unavailable: boolean;
};

function serialize(quote: Quote, empty: boolean) {
  const lines: CartLineView[] = quote.lines.map((l) => ({
    variantId: l.variantId,
    productId: l.productId,
    slug: l.slug,
    title: l.title,
    sku: l.sku,
    size: l.size,
    color: l.color,
    quantity: l.quantity,
    available: l.available,
    unitPriceCents: l.unitPriceCents,
    compareAtCents: l.compareAtCents,
    lineTotalCents: Math.max(0, l.unitPriceCents * l.quantity),
    imageUrl: l.imageUrl,
    isSample: l.isSample,
    unavailable: Boolean(l.unavailable),
  }));
  return {
    lines,
    itemCount: quote.itemCount,
    subtotalCents: quote.subtotalCents,
    discountCents: quote.discountCents,
    lineDiscountCents: quote.lineDiscountCents,
    couponCode: quote.couponCode,
    couponDiscountCents: quote.couponDiscountCents,
    taxCents: quote.taxCents,
    taxMode: quote.taxMode,
    taxBps: quote.taxBps,
    shippingCents: quote.shippingCents,
    shipping: quote.shipping,
    codFeeCents: quote.codFeeCents,
    totalCents: quote.totalCents,
    compareAtTotalCents: quote.compareAtTotalCents,
    currency: quote.currency,
    reservationToken: quote.reservationToken,
    blocked: quote.blocked,
    empty,
  };
}

const EMPTY_SHAPE = {
  lines: [] as CartLineView[],
  itemCount: 0,
  subtotalCents: 0,
  discountCents: 0,
  lineDiscountCents: 0,
  couponCode: null,
  couponDiscountCents: 0,
  taxCents: 0,
  taxMode: 'unconfigured' as const,
  taxBps: 0,
  shippingCents: 0,
  shipping: null,
  codFeeCents: 0,
  totalCents: 0,
  compareAtTotalCents: 0,
  currency: 'INR',
  blocked: null,
  empty: true,
};

/** Guest carts need a cookie before the first write; signed-in users never do. */
function ensureKey(req: Request, user: { id: number } | null): { key: string; isNewGuest: boolean } {
  const guest = readCookie(req, CART_COOKIE);
  const key = cartKeyFor(user?.id ?? null, guest);
  if (key) return { key, isNewGuest: false };
  if (user) return { key: `user:${user.id}`, isNewGuest: false };
  return { key: newCartKey(), isNewGuest: true };
}

export async function GET(req: Request) {
  ensureDb();
  return handler(req, {
    method: 'GET',
    run: async ({ user, req: r }) => {
      const key = cartKeyFor(user?.id ?? null, await readCartKey(user));
      if (!key) return NextResponse.json({ ...EMPTY_SHAPE });
      const cartId = loadOrCreateCart(key);
      if (getCartLines(cartId).length === 0) {
        // Still quote it: an empty basket with a coupon attached must show the code.
        const quote = quoteCart({ cartKey: key, userId: user?.id ?? null }).quote;
        return NextResponse.json({ ...serialize(quote, true), message: null });
      }
      const quote = quoteCart({ cartKey: key, userId: user?.id ?? null }).quote;
      return NextResponse.json({ ...serialize(quote, false), message: null });
    },
  });
}

export async function POST(req: Request) {
  ensureDb();
  return handler(req, {
    method: 'POST',
    rate: { rule: 'checkout', scope: ({ user, req: r }) => `cart:${user?.id ?? readCookie(r, CART_COOKIE) ?? ipOf(r)}` },
    run: async ({ user, req: r }) => {
      const body = await readJson(req);
      const variantId = Number(body.variantId);
      const quantity = Number(body.quantity ?? 1);
      if (!Number.isInteger(variantId) || variantId <= 0) throw new AppError('validation_error', 'Choose a size and colour first.', 400);
      if (!Number.isInteger(quantity) || quantity < 1) throw new AppError('validation_error', 'Quantity must be at least one.', 400);

      const { key, isNewGuest } = ensureKey(r, user);
      const res = addLine({ cartKey: key, variantId, quantity });
      const quote = quoteCart({ cartKey: key, userId: user?.id ?? null }).quote;
      const payload = serialize(quote, false);
      const out = NextResponse.json({ ...payload, message: res.message ?? null, quantity: res.quantity }, { status: 201 });
      if (isNewGuest) out.cookies.set(CART_COOKIE, key, cartCookieOptions);
      return out;
    },
  });
}

export async function PATCH(req: Request) {
  ensureDb();
  return handler(req, {
    method: 'PATCH',
    run: async ({ user, req: r }) => {
      const body = await readJson(req);
      const variantId = Number(body.variantId);
      const quantity = Number(body.quantity);
      if (!Number.isInteger(variantId) || !Number.isInteger(quantity)) {
        throw new AppError('validation_error', 'That quantity is not valid.', 400);
      }
      const key = cartKeyFor(user?.id ?? null, await readCartKey(user));
      if (!key) throw new AppError('not_found', 'Your bag is empty.', 404);
      if (quantity <= 0) removeLine(key, variantId);
      else setQuantity({ cartKey: key, variantId, quantity });
      const quote = quoteCart({ cartKey: key, userId: user?.id ?? null }).quote;
      return NextResponse.json({ ...serialize(quote, quote.itemCount === 0), message: null });
    },
  });
}

export async function DELETE(req: Request) {
  ensureDb();
  return handler(req, {
    method: 'DELETE',
    run: async ({ user, req: r }) => {
      const params = new URL(r.url).searchParams;
      const key = cartKeyFor(user?.id ?? null, await readCartKey(user));
      if (!key) return NextResponse.json({ ...EMPTY_SHAPE, message: 'Your bag is empty.' });
      if (params.get('all') === '1') {
        clearCart(key);
        return NextResponse.json({ ...EMPTY_SHAPE, message: 'Bag emptied.' });
      }
      const variantId = Number(params.get('variantId'));
      if (!Number.isInteger(variantId)) throw new AppError('validation_error', 'Unknown item.', 400);
      removeLine(key, variantId);
      const quote = quoteCart({ cartKey: key, userId: user?.id ?? null }).quote;
      return NextResponse.json({ ...serialize(quote, quote.itemCount === 0), message: 'Removed from your bag.' });
    },
  });
}

function ipOf(req: Request): string {
  return (req.headers.get('x-forwarded-for') ?? '').split(',')[0]?.trim() || 'anon';
}
