import { all, get, run } from '../db/client.ts';
import { safeJsonParse } from '../lib/crypto-utils.ts';
import * as env from '../lib/env.ts';

/**
 * Store settings: every business-configurable value lives here rather than in
 * code, so unapproved facts are *absent* rather than invented. Each setting can
 * be marked `requires_review`, which is what the UI shows instead of a fake value.
 */
export type SettingValue = unknown;

export type SettingRecord = {
  key: string;
  value_json: string;
  value_type: string;
  is_secret: number;
  requires_review: number;
  updated_at: string;
  source: string;
};

type Def = { value: SettingValue; requiresReview: boolean; secret?: boolean };

const REVIEW = true;

export const SETTING_DEFAULTS: Record<string, Def> = {
  'store.name': { value: 'K-brands', requiresReview: false },
  'store.tagline': { value: 'Considered menswear for the working week', requiresReview: true },
  'store.legal_entity_name': { value: null, requiresReview: REVIEW },
  'store.gstin': { value: null, requiresReview: REVIEW },
  'store.registered_address': { value: null, requiresReview: REVIEW },
  'store.support_email': { value: null, requiresReview: REVIEW },
  'store.support_phone': { value: null, requiresReview: REVIEW },
  'store.return_address': { value: null, requiresReview: REVIEW },
  'store.billing_address': { value: null, requiresReview: REVIEW },
  'store.launch_region': { value: 'IN', requiresReview: false },
  'store.currency': { value: env.currency, requiresReview: false },
  'catalog.pricing_currency_symbol': { value: '₹', requiresReview: false },
  'tax.mode': { value: 'inclusive_unconfigured', requiresReview: REVIEW },
  'tax.default_bps': { value: 0, requiresReview: REVIEW },
  'shipping.mode': { value: 'unconfigured', requiresReview: REVIEW },
  'shipping.free_threshold_cents': { value: null, requiresReview: REVIEW },
  'shipping.flat_rate_cents': { value: null, requiresReview: REVIEW },
  // Read by checkServiceability(): the store refuses every checkout until the owner
  // approves a zone, which is why it must be writable here rather than only in the DB.
  'shipping.zones': { value: null, requiresReview: REVIEW },
  'shipping.international_enabled': { value: false, requiresReview: false },
  'payment.provider': { value: env.paymentProvider, requiresReview: REVIEW },
  'payment.live_enabled': { value: env.livePaymentsAvailable, requiresReview: false },
  'payment.methods': { value: [], requiresReview: REVIEW },
  'cod.enabled': { value: env.codEnabled, requiresReview: REVIEW },
  'cod.min_order_cents': { value: null, requiresReview: REVIEW },
  'cod.fee_cents': { value: null, requiresReview: REVIEW },
  'returns.enabled': { value: false, requiresReview: REVIEW },
  'returns.window_days': { value: null, requiresReview: REVIEW },
  'returns.exchange_enabled': { value: false, requiresReview: REVIEW },
  'returns.excluded_categories': { value: [], requiresReview: REVIEW },
  'returns.refund_method': { value: 'original_payment_mode', requiresReview: REVIEW },
  'returns.refund_timeline_days': { value: null, requiresReview: REVIEW },
  'returns.return_shipping': { value: 'customer_pays_unconfigured', requiresReview: REVIEW },
  'cancellation.window_minutes': { value: null, requiresReview: REVIEW },
  'cancellation.after_shipment': { value: false, requiresReview: REVIEW },
  'policy.privacy_summary': { value: null, requiresReview: REVIEW },
  'policy.terms_summary': { value: null, requiresReview: REVIEW },
  'feature.demo_catalogue': { value: env.demoCatalogueEnabled, requiresReview: false },
  'feature.sandbox_orders': { value: env.sandboxOrdersEnabled, requiresReview: false },
  'feature.live_commerce': { value: env.liveCommerceEnabled, requiresReview: false },
  'notifications.email_mode': { value: env.emailMode, requiresReview: false },
};

export function ensureDefaults(): void {
  const now = new Date().toISOString();
  for (const [key, def] of Object.entries(SETTING_DEFAULTS)) {
    const existing = get<{ key: string }>('SELECT key FROM settings WHERE key = ?', [key]);
    if (existing) continue;
    run(
      `INSERT INTO settings (key, value_json, value_type, is_secret, requires_review, updated_at, source)
       VALUES (?, ?, ?, ?, ?, ?, 'default')`,
      [
        key,
        JSON.stringify(def.value),
        typeof def.value,
        def.secret ? 1 : 0,
        def.requiresReview ? 1 : 0,
        now,
      ],
    );
  }
}

export function getSetting<T = SettingValue>(key: string, fallback: T = null as T): T {
  const row = get<SettingRecord>('SELECT * FROM settings WHERE key = ?', [key]);
  if (!row) return fallback;
  return safeJsonParse<T>(row.value_json, fallback);
}

export function requiresReview(key: string): boolean {
  const row = get<SettingRecord>('SELECT requires_review FROM settings WHERE key = ?', [key]);
  if (row) return row.requires_review === 1;
  return SETTING_DEFAULTS[key]?.requiresReview ?? true;
}

export function setSetting(
  key: string,
  value: SettingValue,
  opts: { actorUserId?: number | null; requiresReview?: boolean; secret?: boolean } = {},
): void {
  const now = new Date().toISOString();
  const existing = get<{ key: string }>('SELECT key FROM settings WHERE key = ?', [key]);
  const requiresReview = opts.requiresReview ?? false;
  const isSecret = opts.secret ? 1 : 0;
  if (existing) {
    run(
      `UPDATE settings SET value_json = ?, requires_review = ?, is_secret = ?, updated_at = ?, updated_by = ?, source = 'admin'
       WHERE key = ?`,
      [JSON.stringify(value), requiresReview ? 1 : 0, isSecret, now, opts.actorUserId ?? null, key],
    );
    return;
  }
  run(
    `INSERT INTO settings (key, value_json, value_type, is_secret, requires_review, updated_at, updated_by, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'admin')`,
    [
      key,
      JSON.stringify(value),
      typeof value,
      isSecret,
      requiresReview ? 1 : 0,
      now,
      opts.actorUserId ?? null,
    ],
  );
}

export function listSettings(): (SettingRecord & { value: SettingValue })[] {
  return all<SettingRecord>('SELECT * FROM settings ORDER BY key').map((r) => ({
    ...r,
    // Secrets are never surfaced to any UI surface — only their presence.
    value: r.is_secret === 1 ? '•••••• set' : safeJsonParse<SettingValue>(r.value_json, null),
  }));
}

export function settingsForUi() {
  return {
    storeName: getSetting<string>('store.name', 'K-brands'),
    tagline: getSetting<string | null>('store.tagline', null),
    legalEntityName: getSetting<string | null>('store.legal_entity_name', null),
    gstin: getSetting<string | null>('store.gstin', null),
    supportEmail: getSetting<string | null>('store.support_email', null),
    supportPhone: getSetting<string | null>('store.support_phone', null),
    currency: getSetting<string>('store.currency', 'INR'),
    returnsEnabled: getSetting<boolean>('returns.enabled', false),
    returnWindowDays: getSetting<number | null>('returns.window_days', null),
    exchangeEnabled: getSetting<boolean>('returns.exchange_enabled', false),
    codEnabled: getSetting<boolean>('cod.enabled', false),
    shippingMode: getSetting<string>('shipping.mode', 'unconfigured'),
    freeThreshold: getSetting<number | null>('shipping.free_threshold_cents', null),
    flatRate: getSetting<number | null>('shipping.flat_rate_cents', null),
    taxMode: getSetting<string>('tax.mode', 'inclusive_unconfigured'),
    taxBps: getSetting<number>('tax.default_bps', 0),
    policyReview: {
      privacy: requiresReview('policy.privacy_summary'),
      terms: requiresReview('policy.terms_summary'),
      returns: requiresReview('returns.window_days'),
      shipping: requiresReview('shipping.flat_rate_cents'),
      cancellation: requiresReview('cancellation.window_minutes'),
      identity: requiresReview('store.legal_entity_name'),
    },
  };
}

/** Configuration readiness — drives the admin "what is still missing" panel. */
export function readinessReport() {
  ensureDefaults();
  const items = Object.keys(SETTING_DEFAULTS).map((key) => {
    const value = getSetting(key, null);
    return {
      key,
      configured: value !== null && value !== undefined && value !== '',
      requiresReview: requiresReview(key),
    };
  });
  const blockers = items.filter((i) => !i.configured || i.requiresReview).map((i) => i.key);
  return {
    total: items.length,
    configured: items.filter((i) => i.configured && !i.requiresReview).length,
    needingReview: items.filter((i) => i.requiresReview).length,
    items,
    blockers,
    liveCommerce: env.liveCommerceEnabled,
    livePayments: env.livePaymentsAvailable,
    paymentProvider: env.paymentProvider,
    shippingProvider: env.shippingProvider,
    codEnabled: env.codEnabled,
    internationalEnabled: env.internationalShippingEnabled,
    demoCatalogue: env.demoCatalogueEnabled,
    sandboxOrders: env.sandboxOrdersEnabled,
  };
}
