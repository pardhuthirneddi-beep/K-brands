import { all, get, run, transaction } from '../db/client.ts';
import { AppError } from '../lib/errors.ts';
import * as env from '../lib/env.ts';

/**
 * Inventory engine.
 *
 * Model: `variants.stock_qty` is on-hand, `variants.reserved_qty` is held for
 * in-flight checkouts. Available = stock_qty - reserved_qty. Every mutation is a
 * guarded single-statement update inside a BEGIN IMMEDIATE transaction, so two
 * concurrent buyers of the final unit cannot both succeed (see
 * tests/integration/inventory.test.ts).
 */

const nowIso = () => new Date().toISOString();
const ttlMs = () => Math.max(2, env.reservationTtlMinutes) * 60_000;

export type StockState = 'in_stock' | 'low_stock' | 'out_of_stock' | 'unstocked';

export function stockState(available: number, lowWater = 3): StockState {
  if (available <= 0) return 'out_of_stock';
  if (available <= lowWater) return 'low_stock';
  return 'in_stock';
}

export function variantAvailability(variantId: number): number {
  const row = get<{ stock_qty: number; reserved_qty: number }>(
    'SELECT stock_qty, reserved_qty FROM variants WHERE id = ?',
    [variantId],
  );
  if (!row) return 0;
  return Math.max(0, row.stock_qty - row.reserved_qty);
}

export type ReservationLine = { variantId: number; quantity: number };

export type Reservation = {
  token: string;
  expires_at: string;
  lines: { variant_id: number; quantity: number }[];
};

/** Release any reservation whose TTL elapsed. Called before each reservation pass. */
export function expireStaleReservations(now = Date.now()): number {
  const stale = all<{ token: string }>(
    'SELECT token FROM reservations WHERE consumed_at IS NULL AND expires_at <= ?',
    [new Date(now).toISOString()],
  );
  if (stale.length === 0) return 0;
  return transaction(() => {
    let released = 0;
    for (const r of stale) {
      released += releaseReservationLines(r.token);
      run('DELETE FROM reservations WHERE token = ?', [r.token]);
    }
    return released;
  });
}

function releaseReservationLines(token: string): number {
  const lines = all<{ variant_id: number; quantity: number }>(
    'SELECT variant_id, quantity FROM reservation_lines WHERE reservation_token = ?',
    [token],
  );
  for (const l of lines) {
    run(
      `UPDATE variants SET reserved_qty = MAX(0, reserved_qty - ?), updated_at = ? WHERE id = ?`,
      [l.quantity, nowIso(), l.variant_id],
    );
    writeLedger(l.variant_id, 0, 'reservation_release', 'reservation', token, 'expired reservation reclaimed');
  }
  run('DELETE FROM reservation_lines WHERE reservation_token = ?', [token]);
  return lines.length;
}

/**
 * Create (or refresh) a reservation for a set of lines. Throws out_of_stock for
 * the first line that cannot be satisfied — and rolls the whole attempt back, so
 * a partial reservation can never leak.
 */
export function reserve(token: string, lines: ReservationLine[], userId: number | null): Reservation {
  if (lines.length === 0) throw new AppError('validation_error', 'Nothing to reserve.');
  expireStaleReservations();
  return transaction(() => {
    const existing = get<{ token: string }>('SELECT token FROM reservations WHERE token = ?', [token]);
    if (existing) releaseReservationLines(token);
    run('DELETE FROM reservations WHERE token = ?', [token]);

    const expiresAt = new Date(Date.now() + ttlMs()).toISOString();
    run(
      `INSERT INTO reservations (token, cart_key, user_id, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [token, token, userId, expiresAt, nowIso()],
    );

    // Deterministic order prevents AB-BA deadlock patterns between processes.
    const sorted = [...lines].sort((a, b) => a.variantId - b.variantId);
    for (const line of sorted) {
      if (line.quantity <= 0) {
        throw new AppError('out_of_stock', 'Quantity must be at least one.', 422);
      }
      const variant = get<{
        id: number;
        stock_qty: number;
        reserved_qty: number;
        status: string;
        product_id: number;
        sku: string;
      }>('SELECT id, stock_qty, reserved_qty, status, product_id, sku FROM variants WHERE id = ?', [
        line.variantId,
      ]);
      if (!variant || variant.status !== 'active') {
        throw new AppError('out_of_stock', 'That size or colour is no longer available.', 422);
      }
      const purchasable = get<{ status: string; is_sample: number }>(
        'SELECT status, is_sample FROM products WHERE id = ?',
        [variant.product_id],
      );
      if (!purchasable || !['published', 'out_of_stock'].includes(purchasable.status)) {
        throw new AppError('out_of_stock', 'This piece is not available right now.', 422);
      }
      const updated = run(
        `UPDATE variants SET reserved_qty = reserved_qty + ?, updated_at = ?
         WHERE id = ? AND stock_qty - reserved_qty >= ?`,
        [line.quantity, nowIso(), line.variantId, line.quantity],
      );
      if (updated.changes !== 1) {
        const available = variant.stock_qty - variant.reserved_qty;
        throw new AppError(
          'out_of_stock',
          available <= 0
            ? 'This piece has just sold out. Please review your bag.'
            : `Only ${String(available)} left in this size — please adjust your bag.`,
          422,
          { variant: String(line.variantId), available: String(Math.max(0, available)) },
        );
      }
      run('INSERT INTO reservation_lines (reservation_token, variant_id, quantity) VALUES (?, ?, ?)', [
        token,
        line.variantId,
        line.quantity,
      ]);
      writeLedger(line.variantId, 0, 'reservation', 'reservation', token, `held ${String(line.quantity)}`);
    }
    return {
      token,
      expires_at: expiresAt,
      lines: sorted.map((l) => ({ variant_id: l.variantId, quantity: l.quantity })),
    };
  });
}

export function release(token: string): void {
  transaction(() => {
    releaseReservationLines(token);
    run('DELETE FROM reservations WHERE token = ?', [token]);
  });
}

export function getReservation(token: string): Reservation | null {
  const head = get<{ token: string; expires_at: string; consumed_at: string | null }>(
    'SELECT token, expires_at, consumed_at FROM reservations WHERE token = ?',
    [token],
  );
  if (!head || head.consumed_at) return null;
  const lines = all<{ variant_id: number; quantity: number }>(
    'SELECT variant_id, quantity FROM reservation_lines WHERE reservation_token = ?',
    [head.token],
  );
  return { token: head.token, expires_at: head.expires_at, lines };
}

/**
 * Convert a reservation into a real sale: decrement on-hand, drop the hold and
 * re-check availability inside the same transaction. This is the only path that
 * reduces sellable stock for an order.
 */
export function captureForOrder(reservationToken: string, orderId: number): void {
  transaction(() => {
    const res = get<{ consumed_at: string | null }>('SELECT consumed_at FROM reservations WHERE token = ?', [
      reservationToken,
    ]);
    if (!res) throw new AppError('conflict', 'Your reservation expired. Please try again.', 409);
    if (res.consumed_at) {
      throw new AppError('conflict', 'This checkout has already been completed.', 409);
    }
    const lines = all<{ variant_id: number; quantity: number }>(
      'SELECT variant_id, quantity FROM reservation_lines WHERE reservation_token = ?',
      [reservationToken],
    );
    if (lines.length === 0) throw new AppError('conflict', 'Your reservation is empty.', 409);
    for (const l of lines) {
      const updated = run(
        `UPDATE variants
         SET stock_qty = stock_qty - ?,
             reserved_qty = reserved_qty - ?,
             updated_at = ?
         WHERE id = ? AND stock_qty >= ? AND reserved_qty >= ?`,
        [l.quantity, l.quantity, nowIso(), l.variant_id, l.quantity, l.quantity],
      );
      if (updated.changes !== 1) {
        // Defensive: stock moved underneath the reservation. Fail closed, never oversell.
        throw new AppError('out_of_stock', 'Stock changed while placing your order. Nothing was charged.', 409);
      }
      run(
        'UPDATE reservation_lines SET order_id = ? WHERE reservation_token = ? AND variant_id = ?',
        [orderId, reservationToken, l.variant_id],
      );
      writeLedger(l.variant_id, -l.quantity, 'sale_capture', 'order', String(orderId), 'stock sold');
    }
    run('UPDATE reservations SET consumed_at = ? WHERE token = ?', [nowIso(), reservationToken]);
  });
}

/** Return units to stock (approved return / cancelled paid order). */
export function restock(
  variantId: number,
  quantity: number,
  refType: string,
  refId: string,
  actorUserId: number | null,
  note: string,
): void {
  transaction(() => {
    const updated = run('UPDATE variants SET stock_qty = stock_qty + ?, updated_at = ? WHERE id = ?', [
      quantity,
      nowIso(),
      variantId,
    ]);
    if (updated.changes !== 1) throw new AppError('not_found', 'Variant not found.', 404);
    writeLedger(variantId, quantity, 'return_approved', refType, refId, note, actorUserId);
  });
}

export function adjustStock(
  variantId: number,
  delta: number,
  actorUserId: number,
  note: string,
  reason: 'adjustment' | 'purchase' | 'correction' | 'sample_seed' = 'adjustment',
): { stock_qty: number } {
  return transaction(() => {
    const v = get<{ stock_qty: number; reserved_qty: number }>(
      'SELECT stock_qty, reserved_qty FROM variants WHERE id = ?',
      [variantId],
    );
    if (!v) throw new AppError('not_found', 'Variant not found.', 404);
    const next = v.stock_qty + delta;
    if (next < v.reserved_qty) {
      throw new AppError(
        'conflict',
        `Cannot reduce below ${String(v.reserved_qty)} unit(s) currently held by open checkouts.`,
        409,
      );
    }
    if (next < 0) throw new AppError('validation_error', 'Stock cannot go negative.', 400);
    run('UPDATE variants SET stock_qty = ?, updated_at = ? WHERE id = ?', [next, nowIso(), variantId]);
    writeLedger(variantId, delta, reason, 'admin', String(actorUserId), note, actorUserId);
    return { stock_qty: next };
  });
}

function writeLedger(
  variantId: number,
  change: number,
  reason: string,
  refType: string,
  refId: string,
  note: string,
  actorUserId: number | null = null,
): void {
  const bal = get<{ stock_qty: number }>('SELECT stock_qty FROM variants WHERE id = ?', [variantId]);
  run(
    `INSERT INTO inventory_ledger (variant_id, change_qty, reason, balance_after, ref_type, ref_id, actor_user_id, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [variantId, change, reason, bal?.stock_qty ?? 0, refType, refId, actorUserId, note.slice(0, 300), nowIso()],
  );
}

export function stockForVariantIds(ids: number[]): Map<number, { available: number; onHand: number; reserved: number }> {
  if (ids.length === 0) return new Map();
  const ph = ids.map(() => '?').join(',');
  const rows = all<{ id: number; stock_qty: number; reserved_qty: number }>(
    `SELECT id, stock_qty, reserved_qty FROM variants WHERE id IN (${ph})`,
    ids,
  );
  return new Map(
    rows.map((r) => [
      r.id,
      { available: Math.max(0, r.stock_qty - r.reserved_qty), onHand: r.stock_qty, reserved: r.reserved_qty },
    ]),
  );
}

export function lowStockReport(limit = 50) {
  return all(
    `SELECT v.id AS variant_id, p.title, p.slug, v.size, v.color_name, v.sku, v.stock_qty, v.reserved_qty, p.is_sample,
            (v.stock_qty - v.reserved_qty) AS available
     FROM variants v JOIN products p ON p.id = v.product_id
     WHERE (v.stock_qty - v.reserved_qty) <= 3
     ORDER BY available ASC, p.title ASC LIMIT ?`,
    [Math.min(limit, 200)],
  );
}
