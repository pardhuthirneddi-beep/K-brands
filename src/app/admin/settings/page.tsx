import { ensureDb } from '@/lib/bootstrap.ts';
import { listSettings, readinessReport, SETTING_DEFAULTS } from '@/domain/settings.ts';
import { Panel, Stat } from '@/components/admin/panel.tsx';
import { SettingRow, type SettingKind } from '@/components/admin/setting-row.tsx';
import { Badge } from '@/components/ui/badge.tsx';
import * as env from '@/lib/env.ts';

import { requireAdminPage } from '@/lib/session.ts';
ensureDb();
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Settings' };

const GROUPS: { title: string; intro?: string; keys: { key: string; label: string; kind: SettingKind; hint?: string }[] }[] = [
  {
    title: 'Store identity',
    intro:
      'Anything the customer is told about who they are buying from. Blank values stay blank — the storefront prints “not configured yet” rather than a placeholder.',
    keys: [
      { key: 'store.name', label: 'Store name', kind: 'string' },
      { key: 'store.tagline', label: 'Tagline', kind: 'string' },
      { key: 'store.legal_entity_name', label: 'Legal entity name', kind: 'string', hint: 'Appears in policies, invoices and refund records.' },
      { key: 'store.gstin', label: 'GSTIN', kind: 'string' },
      { key: 'store.registered_address', label: 'Registered address', kind: 'string' },
      { key: 'store.support_email', label: 'Support email', kind: 'string', hint: 'Shown on /contact once set.' },
      { key: 'store.support_phone', label: 'Support phone', kind: 'string' },
      { key: 'store.return_address', label: 'Return address', kind: 'string', hint: 'Printed on approved return instructions.' },
      { key: 'store.billing_address', label: 'Billing / invoice address', kind: 'string' },
      { key: 'store.currency', label: 'Currency', kind: 'string', hint: 'Money is stored in paise; changing this does not re-price the catalogue.' },
      { key: 'catalog.pricing_currency_symbol', label: 'Currency symbol', kind: 'string' },
    ],
  },
  {
    title: 'Tax',
    keys: [
      { key: 'tax.mode', label: 'Mode', kind: 'string', hint: 'inclusive_unconfigured | exclusive | not_applicable — drives the “tax not configured” note in baskets.' },
      { key: 'tax.default_bps', label: 'Default rate (basis points)', kind: 'number', hint: '500 = 5%. Per-product tax_bps wins when set.' },
    ],
  },
  {
    title: 'Shipping',
    keys: [
      { key: 'shipping.mode', label: 'Mode', kind: 'string', hint: 'unconfigured | flat | free_above_threshold | carrier_rates' },
      { key: 'shipping.free_threshold_cents', label: 'Free above (paise)', kind: 'number' },
      { key: 'shipping.flat_rate_cents', label: 'Flat rate (paise)', kind: 'number' },
      { key: 'shipping.international_enabled', label: 'International shipping', kind: 'boolean' },
      {
        key: 'shipping.zones',
        label: 'Approved delivery zones',
        kind: 'json',
        hint: 'e.g. {"pincodePrefixes":["411","560"],"states":["MH","KA"]} — an empty list means every Indian PIN code is serviceable. Until this is saved, checkout is refused for everyone: we never promise delivery to an address we have not agreed to serve.',
      },
    ],
  },
  {
    title: 'Payments',
    keys: [
      { key: 'payment.provider', label: 'Provider', kind: 'string', hint: 'Adapter must exist in src/adapters/payment.ts and be selected via KBRANDS_PAYMENT_PROVIDER.' },
      { key: 'payment.live_enabled', label: 'Live payments', kind: 'boolean', hint: 'Env-controlled (KBRANDS_LIVE_PAYMENTS) — refusing to flip it here is deliberate, since it moves real money.' },
      { key: 'payment.methods', label: 'Methods offered', kind: 'list', hint: 'e.g. upi, cards, netbanking, wallets' }, // guard-allow: payment method names, not merchandise
      { key: 'cod.enabled', label: 'Cash on delivery', kind: 'boolean' },
      { key: 'cod.min_order_cents', label: 'COD minimum order (paise)', kind: 'number' },
      { key: 'cod.fee_cents', label: 'COD handling fee (paise)', kind: 'number' },
    ],
  },
  {
    title: 'Returns, exchanges & refunds',
    intro: 'These values are what the published return policy prints and what the eligibility check enforces. Until they are set, both say “not configured”.',
    keys: [
      { key: 'returns.enabled', label: 'Returns accepted', kind: 'boolean' },
      { key: 'returns.window_days', label: 'Window (days from delivery)', kind: 'number' },
      { key: 'returns.exchange_enabled', label: 'Exchanges allowed', kind: 'boolean' },
      { key: 'returns.excluded_categories', label: 'Excluded category slugs', kind: 'list' },
      { key: 'returns.refund_method', label: 'Refund method', kind: 'string' },
      { key: 'returns.refund_timeline_days', label: 'Refund timeline (days)', kind: 'number' },
      { key: 'returns.return_shipping', label: 'Who pays return shipping', kind: 'string' },
      { key: 'cancellation.window_minutes', label: 'Self-service cancellation window (minutes)', kind: 'number' },
      { key: 'cancellation.after_shipment', label: 'Cancellable after shipment', kind: 'boolean' },
    ],
  },
  {
    title: 'Legal copy',
    keys: [
      { key: 'policy.privacy_summary', label: 'Privacy summary', kind: 'json', hint: 'Used on the privacy page and at checkout.' },
      { key: 'policy.terms_summary', label: 'Terms summary', kind: 'json' },
    ],
  },
  {
    title: 'Launch switches',
    intro: 'Read from the environment. Editing them here does not change the deployment — the value shown is what the running process was started with.',
    keys: [
      { key: 'feature.demo_catalogue', label: 'Demo catalogue visible', kind: 'boolean', hint: 'KBRANDS_DEMO_CATALOGUE' },
      { key: 'feature.sandbox_orders', label: 'Sandbox orders allowed', kind: 'boolean', hint: 'KBRANDS_SANDBOX_ORDERS' },
      { key: 'feature.live_commerce', label: 'Live commerce', kind: 'boolean', hint: 'KBRANDS_LIVE_COMMERCE — also flips robots.txt and the launch banner' },
      { key: 'notifications.email_mode', label: 'Email transport', kind: 'string', hint: 'KBRANDS_EMAIL_MODE=none keeps mail in the queue only' },
    ],
  },
];

export default async function AdminSettingsPage() {
  await requireAdminPage();
  const rows = listSettings();
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const report = readinessReport();

  return (
    <div className="space-y-5">
      <header>
        <p className="eyebrow">Store setup</p>
        <h1 className="font-display text-[27px] leading-tight">Settings &amp; readiness</h1>
        <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-ink-500">
          Every number a customer could rely on — return window, shipping price, refund timeline — lives here and
          needs an explicit owner decision. Nothing was invented to fill a gap: where a value is missing the site says
          so out loud, and the policy pages refuse to publish a promise.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Settings settled" value={report.configured} hint={`of ${report.total} keys`} tone="ok" />
        <Stat label="Awaiting owner approval" value={report.needingReview} hint="Values exist but are unverified" tone="warn" />
        <Stat label="Launch blockers" value={report.blockers.length} hint={report.liveCommerce ? 'Live commerce is on' : 'Live commerce off until the switch is flipped'} tone={report.blockers.length > 0 ? 'error' : 'ok'} />
      </div>

      <Panel title="Environment (not editable here)">
        <ul className="grid gap-2 text-[12.5px] sm:grid-cols-2">
          {[
            ['KBRANDS_APP_SECRET', env.configuredSecrets.includes('KBRANDS_APP_SECRET') ? 'set' : 'missing'],
            ['KBRANDS_PAYMENT_SECRET', env.configuredSecrets.includes('KBRANDS_PAYMENT_SECRET') ? 'set' : 'not set'],
            ['KBRANDS_EMAIL_API_KEY', env.configuredSecrets.includes('KBRANDS_EMAIL_API_KEY') ? 'set' : 'not set'],
            ['KBRANDS_PAYMENT_PROVIDER', env.paymentProvider],
            ['KBRANDS_SHIPPING_PROVIDER', env.shippingProvider],
            ['KBRANDS_LIVE_PAYMENTS', env.livePaymentsAvailable ? 'on' : 'off'],
            ['KBRANDS_LIVE_COMMERCE', env.liveCommerceEnabled ? 'on' : 'off'],
            ['KBRANDS_EMAIL_MODE', env.emailMode],
            ['KBRANDS_DEMO_CATALOGUE', env.demoCatalogueEnabled ? 'on' : 'off'],
            ['KBRANDS_SANDBOX_ORDERS', env.sandboxOrdersEnabled ? 'on' : 'off'],
            ['KBRANDS_DB_PATH', env.dbPathOverride || '.data/kbrands.sqlite3 (default)'],
            ['NODE_ENV', env.isProduction ? 'production' : 'development'],
          ].map(([k, v]) => (
            <li key={k as string} className="flex items-center justify-between gap-3 border-b border-stone-200 pb-1.5 last:border-0">
              <code className="text-[11.5px] text-ink-500">{k as string}</code>
              <Badge tone={v === 'missing' ? 'error' : 'neutral'}>{String(v)}</Badge>
            </li>
          ))}
        </ul>
      </Panel>

      {GROUPS.map((g) => (
        <Panel key={g.title} title={g.title} note={g.intro}>
          <ul>
            {g.keys.map((spec) => {
              const row = byKey.get(spec.key);
              const editable = row ? row.is_secret !== 1 : true;
              return (
                <SettingRow
                  key={spec.key}
                  settingKey={spec.key}
                  label={spec.label}
                  kind={spec.kind}
                  needsReview={row?.requires_review === 1 || SETTING_DEFAULTS[spec.key]?.requiresReview === true}
                  source={row?.source ?? 'default'}
                  updatedAt={row?.updated_at ?? '—'}
                  initial={row && editable ? row.value : null}
                  hint={spec.hint}
                />
              );
            })}
          </ul>
        </Panel>
      ))}
    </div>
  );
}

