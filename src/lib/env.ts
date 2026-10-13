/**
 * Server-side runtime configuration. Every value here is a *deployment* switch,
 * never a business claim. Secrets are read from env and never echoed to the
 * client or to logs (see `redactedSecretNames` + docs/environment.md).
 */
const flag = (v: string | undefined, dflt = false): boolean =>
  v === undefined ? dflt : ['1', 'true', 'yes', 'on'].includes(v.trim().toLowerCase());

const str = (v: string | undefined, dflt = ''): string => (v ?? dflt).trim() || dflt;

export const RUNTIME_ENV = str(process.env.NODE_ENV, 'development');
export const isProduction = RUNTIME_ENV === 'production';

/**
 * LIVE COMMERCE MASTER SWITCH — off by default.
 * When false the store is fully browsable and testable, checkout can create
 * *sandbox* orders, and no real charge, shipment or COD commitment is possible.
 */
export const liveCommerceEnabled = flag(process.env.KBRANDS_LIVE_COMMERCE, false);

/** Demo/sample catalogue visibility. Seeded sample products are never live inventory. */
export const demoCatalogueEnabled = flag(process.env.KBRANDS_DEMO_CATALOGUE, !isProduction);

/** If false, any attempt to place an order (even sandbox) is rejected. */
export const sandboxOrdersEnabled = flag(process.env.KBRANDS_SANDBOX_ORDERS, !isProduction);

export const paymentProvider = str(process.env.KBRANDS_PAYMENT_PROVIDER, 'none');
export const shippingProvider = str(process.env.KBRANDS_SHIPPING_PROVIDER, 'none');

/** Payments are only "live" when the switch, the provider and its secret all agree. */
export const livePaymentsAvailable =
  liveCommerceEnabled && paymentProvider !== 'none' && Boolean(process.env.KBRANDS_PAYMENT_SECRET);

/** COD is opt-in only; never inferred from gateway or courier choice. */
export const codEnabled = flag(process.env.KBRANDS_COD_ENABLED, false);

/** International destinations stay closed until operations confirm support. */
export const internationalShippingEnabled = flag(process.env.KBRANDS_INTL_ENABLED, false);
export const defaultCountry = str(process.env.KBRANDS_DEFAULT_COUNTRY, 'IN');
export const supportedCountries = str(process.env.KBRANDS_SUPPORTED_COUNTRIES, 'IN')
  .split(',')
  .map((c) => c.trim().toUpperCase())
  .filter(Boolean);

export const currency = str(process.env.KBRANDS_CURRENCY, 'INR');

export const siteUrl = str(process.env.KBRANDS_SITE_URL, 'http://localhost:3000').replace(/\/$/, '');

/** Email transport. 'none' means: build the queue, do not claim delivery. */
export const emailMode = str(process.env.KBRANDS_EMAIL_MODE, 'none');
export const emailFrom = str(process.env.KBRANDS_EMAIL_FROM, 'K-brands <replies@unconfigured.invalid>');

export const sessionTtlDays = Number(process.env.KBRANDS_SESSION_DAYS ?? 14);
export const reservationTtlMinutes = Number(process.env.KBRANDS_RESERVATION_MINUTES ?? 20);

/** Absolute cap on any single line quantity, independent of stock. */
export const maxQuantityPerLine = Number(process.env.KBRANDS_MAX_QTY ?? 10);

export function requireServerCryptoSecret(): string {
  const secret = str(process.env.KBRANDS_APP_SECRET);
  if (secret) return secret;
  if (isProduction) {
    throw new Error(
      'KBRANDS_APP_SECRET is required in production (used for session signing, CSRF tokens and webhook signature checks).',
    );
  }
  // Deterministic dev-only fallback so local work never needs a secret file.
  return 'k-brands-development-only-secret-do-not-use-in-production';
}

/** Names of the sensitive variables that are present — never their values. */
export const configuredSecrets: string[] = [
  'KBRANDS_APP_SECRET',
  'KBRANDS_PAYMENT_SECRET',
  'KBRANDS_EMAIL_API_KEY',
  'KBRANDS_SHIPPING_API_KEY',
].filter((name) => Boolean(process.env[name]));

export const dbPathOverride = str(process.env.KBRANDS_DB_PATH);

export function redactedSecretNames(): string[] {
  return [
    'KBRANDS_APP_SECRET',
    'KBRANDS_PAYMENT_SECRET',
    'KBRANDS_EMAIL_API_KEY',
    'KBRANDS_SHIPPING_API_KEY',
    'KBRANDS_DB_PATH',
  ];
}
