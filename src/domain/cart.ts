import crypto from 'node:crypto';
import { all, get, run, transaction } from '../db/client.ts';
import * as env from '../lib/env.ts';
import { AppError } from '../lib/errors.ts';
import { variantWithProduct } from './catalog.ts';
import { pricingFromLines, type PricedLine, type Quote } from './pricing.ts';
import { reserve, expireStaleReservations } from './inventory.ts';

/**
 * Cart. Guest carts are keyed by an opaque random cookie value; signed-in carts
 * are keyed by `user:<id>`. On login the guest cart merges into the user cart
 * (quantities capped, never summed past stock).
 */

export const newCartKey = (): string => `guest:${crypto.randomBytes(16).toString('base64url')}`;
const nowIso = () => new Date().toISOString();

export function cartKeyFor(userId: number | null | undefined, guestKey: string | null): string | null {
  if (userId) return `user:${userId}`;
  return guestKey;
}

export function loadOrCreateCart(key: string) {
  const row = get<{ id: number }>('SELECT id FROM carts WHERE key = ?', [key]);
  if (row) return row.id;
  const userIdMatch = /^user:(\d+)$/.exec(key);
  const res = run(
    'INSERT INTO carts (key, user_id, created_at, updated_at) VALUES (?, ?, ?, ?)',
    [key, userIdMatch ? Number(userIdMatch[1]) : null, nowIso(), nowIso()],
  );
  return res.lastInsertRowid;
}

export function getCartLines(cartId: number): PricedLine[] {
  const rows = all<{ variant_id: number; quantity: number }>(
    'SELECT variant_id, quantity FROM cart_lines WHERE cart_id = ? ORDER BY added_at, id',
    [cartId],
  );
  return rows.map((r) => {
    const v = variantWithProduct(r.variant_id);
    if (!v) {
      return {
        variantId: r.variant_id,
        productId: 0,
        slug: 'unavailable',
        title: 'Item no longer available',
        sku: '—',
        size: null,
        color: null,
        unitPriceCents: 0,
        compareAtCents: null,
        quantity: r.quantity,
        available: 0,
        isSample: false,
        imageUrl: null,
        taxBps: 0,
        currency: env.currency,
        unavailable: true,
      };
    }
    return {
      variantId: v.variant_id,
      productId: v.product_id,
      slug: v.slug,
      title: v.title,
      sku: v.sku,
      size: v.size,
      color: v.color_name,
      unitPriceCents: v.price_cents,
      compareAtCents: v.compare_at_price_cents,
      quantity: r.quantity,
      available: Math.max(0, v.stock_qty - v.reserved_qty),
      isSample: v.is_sample === 1,
      imageUrl: v.image_url,
      taxBps: v.tax_bps,
      currency: v.currency,
      unavailable: v.status !== 'published' && v.status !== 'out_of_stock',
    };
  });
}

export function addLine(input: {
  cartKey: string;
  variantId: number;
  quantity: number;
}): { ok: true; quantity: number; available: number; message?: string } {
  const qty = Math.max(1, Math.trunc(input.quantity));
  if (qty > env.maxQuantityPerLine) {
    throw new AppError('validation_error', `A maximum of ${String(env.maxQuantityPerLine)} units per style can be ordered at once.`, 400);
  }
  return transaction(() => {
    const cartId = loadOrCreateCart(input.cartKey);
    const v = variantWithProduct(input.variantId);
    if (!v) throw new AppError('not_found', 'That item is not available.', 404);
    if (v.variant_status !== 'active' || !['published', 'out_of_stock'].includes(v.status)) {
      throw new AppError('out_of_stock', 'This piece cannot be added right now.', 422);
    }
    const available = Math.max(0, v.stock_qty - v.reserved_qty);
    if (available <= 0) {
      throw new AppError('out_of_stock', 'This size is sold out.', 422);
    }
    const existing = get<{ id: number; quantity: number }>(
      'SELECT id, quantity FROM cart_lines WHERE cart_id = ? AND variant_id = ?',
      [cartId, input.variantId],
    );
    const nextQty = Math.min(existing ? existing.quantity + qty : qty, available, env.maxQuantityPerLine);
    const capped = existing && nextQty < existing.quantity + qty;
    if (existing) {
      run('UPDATE cart_lines SET quantity = ? WHERE id = ?', [nextQty, existing.id]);
    } else {
      run('INSERT INTO cart_lines (cart_id, variant_id, quantity, added_at) VALUES (?, ?, ?, ?)', [
        cartId,
        input.variantId,
        nextQty,
        nowIso(),
      ]);
    }
    run('UPDATE carts SET updated_at = ? WHERE id = ?', [nowIso(), cartId]);
    return {
      ok: true as const,
      quantity: nextQty,
      available,
      message: capped ? `We’ve limited this bag to ${String(nextQty)} of this size — that is all the stock we hold.` : undefined,
    };
  });
}

export function setQuantity(input: { cartKey: string; variantId: number; quantity: number }): { ok: true } {
  const qty = Math.trunc(input.quantity);
  return transaction(() => {
    const cart = get<{ id: number }>('SELECT id FROM carts WHERE key = ?', [input.cartKey]);
    if (!cart) throw new AppError('not_found', 'Your bag is empty.', 404);
    if (qty <= 0) {
      run('DELETE FROM cart_lines WHERE cart_id = ? AND variant_id = ?', [cart.id, input.variantId]);
    } else {
      if (qty > env.maxQuantityPerLine) {
        throw new AppError('validation_error', `Maximum ${String(env.maxQuantityPerLine)} units per style.`, 400);
      }
      const v = variantWithProduct(input.variantId);
      const available = v ? Math.max(0, v.stock_qty - v.reserved_qty) : 0;
      if (qty > available) {
        throw new AppError(
          'out_of_stock',
          available <= 0 ? 'This size has just sold out.' : `Only ${String(available)} available.`,
          422,
        );
      }
      const res = run('UPDATE cart_lines SET quantity = ? WHERE cart_id = ? AND variant_id = ?', [
        qty,
        cart.id,
        input.variantId,
      ]);
      if (res.changes === 0) {
        run('INSERT INTO cart_lines (cart_id, variant_id, quantity, added_at) VALUES (?, ?, ?, ?)', [
          cart.id,
          input.variantId,
          qty,
          nowIso(),
        ]);
      }
    }
    run('UPDATE carts SET updated_at = ? WHERE id = ?', [nowIso(), cart.id]);
    return { ok: true as const };
  });
}

export function removeLine(cartKey: string, variantId: number): void {
  transaction(() => {
    const cart = get<{ id: number }>('SELECT id FROM carts WHERE key = ?', [cartKey]);
    if (!cart) return;
    run('DELETE FROM cart_lines WHERE cart_id = ? AND variant_id = ?', [cart.id, variantId]);
    run('UPDATE carts SET updated_at = ? WHERE id = ?', [nowIso(), cart.id]);
  });
}

export function clearCart(cartKey: string): void {
  transaction(() => {
    const cart = get<{ id: number }>('SELECT id FROM carts WHERE key = ?', [cartKey]);
    if (!cart) return;
    run('DELETE FROM cart_lines WHERE cart_id = ?', [cart.id]);
    run('UPDATE carts SET coupon_code = NULL, updated_at = ? WHERE id = ?', [nowIso(), cart.id]);
  });
}

/** Merge a guest cart into the user cart on sign-in. Caps at available stock. */
export function mergeCarts(fromKey: string, toKey: string): void {
  if (!fromKey || fromKey === toKey) return;
  transaction(() => {
    const from = get<{ id: number }>('SELECT id FROM carts WHERE key = ?', [fromKey]);
    const to = get<{ id: number }>('SELECT id FROM carts WHERE key = ?', [toKey]);
    if (!from) return;
    if (!to) {
      run('UPDATE carts SET key = ?, user_id = COALESCE(user_id, ?) WHERE id = ?', [
        toKey,
        /^user:(\d+)$/.test(toKey) ? Number(/^user:(\d+)$/.exec(toKey)?.[1]) : null,
        from.id,
      ]);
      return;
    }
    const lines = all<{ variant_id: number; quantity: number }>(
      'SELECT variant_id, quantity FROM cart_lines WHERE cart_id = ?',
      [from.id],
    );
    for (const l of lines) {
      const v = variantWithProduct(l.variant_id);
      const cap = Math.min(
        env.maxQuantityPerLine,
        v ? Math.max(0, v.stock_qty - v.reserved_qty) : env.maxQuantityPerLine,
      );
      if (cap <= 0) continue;
      const existing = get<{ id: number; quantity: number }>(
        'SELECT id, quantity FROM cart_lines WHERE cart_id = ? AND variant_id = ?',
        [to.id, l.variant_id],
      );
      const nextQty = Math.min(cap, l.quantity + (existing?.quantity ?? 0));
      if (existing) run('UPDATE cart_lines SET quantity = ? WHERE id = ?', [nextQty, existing.id]);
      else
        run('INSERT INTO cart_lines (cart_id, variant_id, quantity, added_at) VALUES (?, ?, ?, ?)', [
          to.id,
          l.variant_id,
          nextQty,
          nowIso(),
        ]);
    }
    run('DELETE FROM cart_lines WHERE cart_id = ?', [from.id]);
    run('DELETE FROM carts WHERE id = ?', [from.id]);
    run('UPDATE carts SET updated_at = ? WHERE id = ?', [nowIso(), to.id]);
  });
}

export function countItems(cartKey: string | null): number {
  if (!cartKey) return 0;
  return (
    get<{ n: number }>(
      `SELECT COALESCE(SUM(cl.quantity), 0) AS n FROM cart_lines cl JOIN carts c ON c.id = cl.cart_id WHERE c.key = ?`,
      [cartKey],
    )?.n ?? 0
  );
}

export function quoteCart(input: { cartKey: string | null; userId: number | null }): {
  quote: Quote;
  reservationToken: string;
} {
  if (!input.cartKey) throw new AppError('validation_error', 'Your bag is empty.', 400);
  expireStaleReservations();
  const cartId = loadOrCreateCart(input.cartKey);
  const lines = getCartLines(cartId);
  const couponCode = get<{ coupon_code: string | null }>('SELECT coupon_code FROM carts WHERE id = ?', [cartId])
    ?.coupon_code;
  const quote = pricingFromLines({ lines, couponCode: couponCode ?? null, userId: input.userId });
  const token = reservationTokenFor(input.cartKey, quote.lines, input.userId);
  return { quote: { ...quote, reservationToken: token }, reservationToken: token };
}

/**
 * Keep a live hold on the bag's contents while the customer is shopping out.
 * The reservation is refreshed (TTL) on every quote so it never silently expires
 * mid-checkout.
 */
function reservationTokenFor(cartKey: string, lines: PricedLine[], userId: number | null): string {
  const sellable = lines.filter((l) => !l.unavailable && !l.pricingBlocked);
  const token = `res:${cartKey}`;
  const wanted = sellable.map((l) => ({ variantId: l.variantId, quantity: l.quantity }));
  if (wanted.length === 0) return token;
  try {
    reserve(token, wanted, userId);
  } catch (err) {
    if (err instanceof AppError && err.code === 'out_of_stock') {
      // Refresh will surface the updated availability; do not break browsing.
      return token;
    }
    throw err;
  }
  return token;
}

export function attachCartUser(cartKey: string, userId: number): void {
  run('UPDATE carts SET user_id = ?, updated_at = ? WHERE key = ?', [userId, nowIso(), cartKey]);
}
