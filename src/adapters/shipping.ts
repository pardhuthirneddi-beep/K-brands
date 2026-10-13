import crypto from 'node:crypto';
import { all, get, run, transaction } from '../db/client.ts';
import * as env from '../lib/env.ts';
import { AppError } from '../lib/errors.ts';
import { recordAudit } from '../domain/audit.ts';
import { enqueueNotification } from '../domain/notifications.ts';
import { getSetting } from '../domain/settings.ts';

/**
 * Courier-aggregator adapter — provider undecided.
 *
 * Serviceability and (optionally) rate quotes come from *configured store rules*,
 * not from this module. Live shipment creation is impossible until
 * `KBRANDS_SHIPPING_PROVIDER` names a real, configured provider and
 * `KBRANDS_LIVE_COMMERCE=1`. Nothing in this file may produce a tracking number
 * that looks real: every mock shipment is written with `provider_mode='mock'`
 * and a tracking reference prefixed `MOCK-`, and the UI never renders it as a
 * live courier link.
 */

export type ServiceabilityResult = {
  serviceable: boolean;
  reason: string | null;
  source: 'configured_zones' | 'provider_lookup' | 'not_configured';
};

export function checkServiceability(input: { pincode: string; countryCode?: string }): ServiceabilityResult {
  const country = (input.countryCode ?? 'IN').toUpperCase();
  if (country !== 'IN' && !env.internationalShippingEnabled) {
    return {
      serviceable: false,
      reason: 'We currently ship only within India.',
      source: 'not_configured',
    };
  }
  const mode = getSetting<string>('shipping.mode', 'unconfigured');
  if (mode === 'unconfigured') {
    return {
      serviceable: false,
      reason:
        'Delivery for this PIN code cannot be confirmed yet — the shipping setup is incomplete. We will contact you once it is available.',
      source: 'not_configured',
    };
  }
  const zones = getSetting<{ pincodePrefixes?: string[]; states?: string[] } | null>('shipping.zones', null);
  if (!zones) {
    return {
      serviceable: false,
      reason: 'No delivery zones have been approved for this store yet.',
      source: 'not_configured',
    };
  }
  const prefixes = zones.pincodePrefixes ?? [];
  const states = zones.states ?? [];
  const okPrefix = prefixes.length === 0 || prefixes.some((p) => input.pincode.startsWith(p));
  return {
    serviceable: okPrefix,
    reason: okPrefix ? null : 'We do not deliver to this PIN code yet.',
    source: 'configured_zones',
  };
}

export function rateQuote(input: { subtotalCents: number; pincode: string }): { feeCents: number; mode: string; note: string | null } {
  const mode = getSetting<string>('shipping.mode', 'unconfigured');
  if (mode === 'unconfigured') return { feeCents: 0, mode: 'unconfigured', note: 'Shipping is not configured.' };
  const flat = getSetting<number | null>('shipping.flat_rate_cents', null);
  const freeAt = getSetting<number | null>('shipping.free_threshold_cents', null);
  if (flat == null) return { feeCents: 0, mode: 'unconfigured', note: 'No shipping rate has been approved.' };
  if (freeAt != null && input.subtotalCents >= freeAt) {
    return { feeCents: 0, mode: 'configured', note: null };
  }
  return { feeCents: Math.max(0, Math.trunc(flat)), mode: 'configured', note: null };
}

/**
 * Create a shipment. In production with no verified provider this *refuses*;
 * in sandbox it records a clearly-labelled mock shipment.
 */
export function createShipment(
  orderId: number,
  actor: { userId: number; role: string },
): { shipmentId: number; mode: 'mock' | 'live'; trackingReference: string; note: string } {
  const order = get<{ id: number; order_number: string; status: string; total_cents: number }>(
    'SELECT id, order_number, status, total_cents FROM orders WHERE id = ?',
    [orderId],
  );
  if (!order) throw new AppError('not_found', 'Order not found.', 404);
  const liveConfigured = env.liveCommerceEnabled && env.shippingProvider !== 'none' && Boolean(process.env.KBRANDS_SHIPPING_API_KEY);
  if (liveConfigured) {
    // A real provider is configured: the concrete API call belongs in a
    // provider module (see docs/integrations.md). We do not fake it here.
    throw new AppError(
      'shipping_unavailable',
      `Shipping provider “${env.shippingProvider}” is selected but its API module is not implemented in this build. No shipment was created.`,
      503,
    );
  }
  if (!env.sandboxOrdersEnabled) {
    throw new AppError(
      'shipping_unavailable',
      'Live shipment creation is disabled: no courier account is connected to this deployment.',
      503,
    );
  }
  const ts = new Date().toISOString();
  const tracking = `MOCK-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  return transaction(() => {
    const existing = get<{ id: number }>('SELECT id FROM shipments WHERE order_id = ? AND status <> ?', [orderId, 'cancelled']);
    if (existing) throw new AppError('conflict', 'A shipment record already exists for this order.', 409);
    const res = run(
      `INSERT INTO shipments (order_id, provider, provider_mode, provider_shipment_id, tracking_number, courier,
          service, status, estimated_delivery_date, created_at, updated_at)
       VALUES (?, ?, 'mock', ?, ?, 'Unassigned (test)', 'sandbox-standard', 'label_created', NULL, ?, ?)`,
      [orderId, env.shippingProvider === 'none' ? 'mock_courier' : env.shippingProvider, `mockshp_${Date.now().toString(36)}`, tracking, ts, ts],
    );
    run(
      `INSERT INTO shipment_events (shipment_id, status, location, observed_at, note, created_at)
       VALUES (?, 'label_created', 'Sandbox', ?, 'Test label only — no physical parcel exists.', ?)`,
      [res.lastInsertRowid, ts, ts],
    );
    run("UPDATE orders SET fulfilment_status = 'shipped', status = 'shipped', updated_at = ? WHERE id = ?", [ts, orderId]);
    run(
      `INSERT INTO order_events (order_id, event, to_status, actor_user_id, detail, created_at)
       VALUES (?, 'sandbox_shipment_created', 'shipped', ?, ?, ?)`,
      [orderId, actor.userId, `mock tracking ${tracking}`, ts],
    );
    recordAudit({
      action: 'shipment.create',
      targetType: 'order',
      targetId: order.order_number,
      actorUserId: actor.userId,
      actorRole: actor.role,
      summary: `Sandbox shipment created (mock reference ${tracking}) — not a real courier booking`,
    });
    const email = get<{ email: string | null }>(
      'SELECT COALESCE(u.email, o.guest_email) AS email FROM orders o LEFT JOIN users u ON u.id = o.user_id WHERE o.id = ?',
      [orderId],
    )?.email;
    if (email) {
      enqueueNotification({
        template: 'order_shipped',
        recipient: email,
        dedupeKey: `order_shipped:${order.order_number}`,
        subject: `K-brands ${order.order_number}: dispatch update`,
        bodyText: `Your order has been marked as dispatched. Note: this is a test record — no parcel is moving.`,
        relatedType: 'order',
        relatedId: order.order_number,
      });
    }
    return {
      shipmentId: res.lastInsertRowid,
      mode: 'mock' as const,
      trackingReference: tracking,
      note: 'Sandbox shipment. No courier was contacted and no parcel exists.',
    };
  });
}

export function trackingForOrder(orderId: number) {
  const shipment = get<{
    id: number;
    provider: string;
    provider_mode: string;
    tracking_number: string | null;
    courier: string | null;
    status: string;
    estimated_delivery_date: string | null;
    shipped_at: string | null;
    delivered_at: string | null;
  }>('SELECT * FROM shipments WHERE order_id = ? ORDER BY id DESC LIMIT 1', [orderId]);
  if (!shipment) return null;
  const events = all<{ status: string; location: string | null; observed_at: string; note: string | null }>(
    'SELECT status, location, observed_at, note FROM shipment_events WHERE shipment_id = ? ORDER BY id',
    [shipment.id],
  );
  return {
    ...shipment,
    isMock: shipment.provider_mode === 'mock',
    events,
    publicNote:
      shipment.provider_mode === 'mock'
        ? 'This is a development placeholder from our test courier adapter — it is not a live tracking number.'
        : null,
  };
}
