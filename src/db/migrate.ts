import { exec, get, run } from './client.ts';

export type Migration = { version: number; name: string; sql: string };

const M: Migration[] = [];
const push = (name: string, sql: string) => {
  M.push({ version: M.length + 1, name, sql });
};

/* ------------------------------------------------------------------ 001 core */
push(
  'identity-and-catalog',
  `
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  email_norm TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL DEFAULT '',
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer','admin','staff')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','pending_verification')),
  failed_login_count INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  email_verified_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_login_at TEXT
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  revoked_at TEXT,
  ip_hash TEXT,
  user_agent TEXT
);
CREATE INDEX idx_sessions_user ON sessions(user_id, revoked_at);

CREATE TABLE auth_tokens (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('password_reset','email_verify')),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE addresses (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT 'Home',
  recipient_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  line1 TEXT NOT NULL,
  line2 TEXT,
  locality TEXT,
  city TEXT NOT NULL,
  state_code TEXT NOT NULL,
  state_name TEXT NOT NULL,
  pincode TEXT NOT NULL,
  country_code TEXT NOT NULL DEFAULT 'IN',
  is_default_shipping INTEGER NOT NULL DEFAULT 0,
  is_default_billing INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_addresses_user ON addresses(user_id);

CREATE TABLE categories (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  parent_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  image_path TEXT,
  meta_title TEXT,
  meta_description TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE products (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  subtitle TEXT,
  description TEXT,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  brand_line TEXT,
  garment_type TEXT,
  fit TEXT,
  fabric TEXT,
  fabric_composition TEXT,
  care TEXT,
  gender TEXT NOT NULL DEFAULT 'men',
  color_family TEXT,
  occasion TEXT,
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  compare_at_price_cents INTEGER CHECK (compare_at_price_cents IS NULL OR compare_at_price_cents >= price_cents),
  currency TEXT NOT NULL DEFAULT 'INR',
  tax_bps INTEGER NOT NULL DEFAULT 0 CHECK (tax_bps BETWEEN 0 AND 10000),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived','out_of_stock')),
  is_sample INTEGER NOT NULL DEFAULT 0,
  sample_note TEXT,
  size_guide_key TEXT,
  published_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_products_status ON products(status, is_sample);
CREATE INDEX idx_products_category ON products(category_id);

CREATE TABLE product_images (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  alt TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0,
  kind TEXT NOT NULL DEFAULT 'photo' CHECK (kind IN ('photo','placeholder','generated')),
  width INTEGER,
  height INTEGER
);
CREATE INDEX idx_images_product ON product_images(product_id, position);

CREATE TABLE variants (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku TEXT NOT NULL UNIQUE,
  size TEXT,
  color_name TEXT,
  color_code TEXT,
  material_variant TEXT,
  price_cents INTEGER CHECK (price_cents IS NULL OR price_cents >= 0),
  compare_at_price_cents INTEGER,
  stock_qty INTEGER NOT NULL DEFAULT 0 CHECK (stock_qty >= 0),
  reserved_qty INTEGER NOT NULL DEFAULT 0 CHECK (reserved_qty >= 0 AND reserved_qty <= stock_qty),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  barcode TEXT,
  weight_grams INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_variants_product ON variants(product_id);

CREATE TABLE product_tags (
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  PRIMARY KEY (product_id, tag)
);
`,
);

/* ------------------------------------------------------------------ 002 ops */
push(
  'commerce-operations',
  `
CREATE TABLE inventory_ledger (
  id INTEGER PRIMARY KEY,
  variant_id INTEGER NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
  change_qty INTEGER NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('adjustment','purchase','sale_capture','reservation','reservation_release','return_approved','return_rejected','correction','sample_seed')),
  balance_after INTEGER NOT NULL,
  ref_type TEXT,
  ref_id TEXT,
  actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  note TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_ledger_variant ON inventory_ledger(variant_id, id);

CREATE TABLE carts (
  id INTEGER PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  coupon_code TEXT
);

CREATE TABLE cart_lines (
  id INTEGER PRIMARY KEY,
  cart_id INTEGER NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  variant_id INTEGER NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  added_at TEXT NOT NULL,
  UNIQUE (cart_id, variant_id)
);

CREATE TABLE coupons (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK (kind IN ('percent','fixed')),
  value INTEGER NOT NULL CHECK (value >= 0),
  min_subtotal_cents INTEGER NOT NULL DEFAULT 0,
  max_discount_cents INTEGER,
  usage_limit INTEGER,
  per_user_limit INTEGER,
  used_count INTEGER NOT NULL DEFAULT 0,
  starts_at TEXT,
  ends_at TEXT,
  active INTEGER NOT NULL DEFAULT 0,
  is_sample INTEGER NOT NULL DEFAULT 0,
  applies_to_category_slug TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE coupon_redemptions (
  id INTEGER PRIMARY KEY,
  coupon_id INTEGER NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
  order_id INTEGER NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  discount_cents INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (coupon_id, order_id)
);

CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  order_number TEXT NOT NULL UNIQUE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  guest_email TEXT,
  contact_phone TEXT,
  currency TEXT NOT NULL DEFAULT 'INR',
  subtotal_cents INTEGER NOT NULL CHECK (subtotal_cents >= 0),
  discount_cents INTEGER NOT NULL DEFAULT 0 CHECK (discount_cents >= 0),
  shipping_cents INTEGER NOT NULL DEFAULT 0 CHECK (shipping_cents >= 0),
  tax_cents INTEGER NOT NULL DEFAULT 0 CHECK (tax_cents >= 0),
  cod_fee_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
  coupon_code TEXT,
  status TEXT NOT NULL DEFAULT 'pending_payment' CHECK (status IN
    ('pending_payment','awaiting_payment_confirmation','paid','awaiting_fulfilment','packed','shipped','out_for_delivery','delivered','cancelled','cancellation_requested','returns_requested','returned','refunded','partially_refunded','payment_failed','expired')),
  payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN
    ('unpaid','authorized','captured','failed','pending','refunded','partially_refunded')),
  fulfilment_status TEXT NOT NULL DEFAULT 'unfulfilled' CHECK (fulfilment_status IN
    ('unfulfilled','in_progress','shipped','delivered','cancelled')),
  cancellation_status TEXT NOT NULL DEFAULT 'none' CHECK (cancellation_status IN
    ('none','requested','approved','rejected','completed')),
  refund_status TEXT NOT NULL DEFAULT 'none' CHECK (refund_status IN
    ('none','requested','approved','processing','issued','rejected')),
  is_sample_order INTEGER NOT NULL DEFAULT 0,
  idempotency_key TEXT UNIQUE,
  placed_at TEXT,
  cancelled_at TEXT,
  cancel_reason TEXT,
  delivered_at TEXT,
  customer_note TEXT,
  internal_note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_orders_user ON orders(user_id, created_at);
CREATE INDEX idx_orders_status ON orders(status);

CREATE TABLE order_lines (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  variant_id INTEGER REFERENCES variants(id) ON DELETE SET NULL,
  snapshot_title TEXT NOT NULL,
  snapshot_slug TEXT NOT NULL,
  snapshot_sku TEXT NOT NULL,
  snapshot_size TEXT,
  snapshot_color TEXT,
  snapshot_image_url TEXT,
  unit_price_cents INTEGER NOT NULL,
  compare_at_price_cents INTEGER,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  line_tax_cents INTEGER NOT NULL DEFAULT 0,
  line_discount_cents INTEGER NOT NULL DEFAULT 0,
  line_total_cents INTEGER NOT NULL,
  is_sample INTEGER NOT NULL DEFAULT 0,
  tax_bps INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_order_lines_order ON order_lines(order_id);

CREATE TABLE order_events (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  detail TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_order_events ON order_events(order_id, id);

CREATE TABLE shipping_addresses (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'shipping' CHECK (kind IN ('shipping','billing','return')),
  recipient_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  line1 TEXT NOT NULL,
  line2 TEXT,
  locality TEXT,
  city TEXT NOT NULL,
  state_code TEXT NOT NULL,
  state_name TEXT NOT NULL,
  pincode TEXT NOT NULL,
  country_code TEXT NOT NULL,
  address_hash TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE payments (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_mode TEXT NOT NULL DEFAULT 'mock' CHECK (provider_mode IN ('mock','sandbox','live')),
  provider_payment_id TEXT,
  method TEXT NOT NULL DEFAULT 'gateway',
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'INR',
  status TEXT NOT NULL DEFAULT 'initiated' CHECK (status IN
    ('initiated','pending','authorized','captured','failed','cancelled','delayed','refunded','partially_refunded')),
  failure_code TEXT,
  failure_message TEXT,
  idempotency_key TEXT UNIQUE,
  verified_at TEXT,
  verification_source TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_payments_order ON payments(order_id, id);
CREATE UNIQUE INDEX uniq_provider_payment ON payments(provider, provider_payment_id) WHERE provider_payment_id IS NOT NULL;

CREATE TABLE payment_webhook_events (
  id INTEGER PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  signature_valid INTEGER NOT NULL DEFAULT 0,
  processed_at TEXT,
  process_status TEXT NOT NULL DEFAULT 'received' CHECK (process_status IN
    ('received','processed','ignored_duplicate','ignored_unverified','failed')),
  error TEXT,
  order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  received_at TEXT NOT NULL,
  UNIQUE (provider, provider_event_id)
);

CREATE TABLE refunds (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  payment_id INTEGER REFERENCES payments(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  provider_refund_id TEXT,
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'INR',
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN
    ('requested','approved','processing','issued','failed','rejected')),
  reason TEXT,
  initiated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  issued_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE shipments (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_mode TEXT NOT NULL DEFAULT 'mock' CHECK (provider_mode IN ('mock','sandbox','live')),
  provider_shipment_id TEXT,
  tracking_number TEXT,
  courier TEXT,
  service TEXT,
  status TEXT NOT NULL DEFAULT 'label_pending' CHECK (status IN
    ('label_pending','label_created','picked_up','in_transit','out_for_delivery','delivered','delayed','exception','returned_to_sender','cancelled')),
  estimated_delivery_date TEXT,
  shipped_at TEXT,
  delivered_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_shipments_order ON shipments(order_id);

CREATE TABLE shipment_events (
  id INTEGER PRIMARY KEY,
  shipment_id INTEGER NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  location TEXT,
  observed_at TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE returns (
  id INTEGER PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  order_line_id INTEGER REFERENCES order_lines(id) ON DELETE SET NULL,
  type TEXT NOT NULL DEFAULT 'return' CHECK (type IN ('return','exchange','cancellation')),
  reason_code TEXT NOT NULL,
  reason_detail TEXT,
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN
    ('requested','under_review','approved','rejected','pickup_scheduled','in_transit','received','inspection_pending','inspected','refund_pending','refunded','exchange_reserved','exchange_shipped','closed','cancelled')),
  refund_status TEXT NOT NULL DEFAULT 'none' CHECK (refund_status IN
    ('none','pending','approved','issued','rejected')),
  inspection_status TEXT NOT NULL DEFAULT 'not_started' CHECK (inspection_status IN
    ('not_started','pending','passed','failed')),
  disposition TEXT CHECK (disposition IS NULL OR disposition IN ('restock','return_to_supplier','scrap','hold')),
  requested_refund_cents INTEGER CHECK (requested_refund_cents IS NULL OR requested_refund_cents >= 0),
  approved_refund_cents INTEGER CHECK (approved_refund_cents IS NULL OR approved_refund_cents >= 0),
  exchange_variant_id INTEGER REFERENCES variants(id) ON DELETE SET NULL,
  customer_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  decided_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  decided_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_returns_order ON returns(order_id);
`,
);

/* ------------------------------------------------------------------ 003 obs */
push(
  'messaging-audit-settings',
  `
CREATE TABLE notifications (
  id INTEGER PRIMARY KEY,
  dedupe_key TEXT NOT NULL UNIQUE,
  channel TEXT NOT NULL DEFAULT 'email' CHECK (channel IN ('email','sms','whatsapp')),
  template TEXT NOT NULL,
  recipient TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_text TEXT NOT NULL,
  payload_json TEXT,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN
    ('queued','sent','skipped_no_provider','suppressed','failed','retrying')),
  provider TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  related_type TEXT,
  related_id TEXT,
  created_at TEXT NOT NULL,
  sent_at TEXT,
  next_retry_at TEXT
);
CREATE INDEX idx_notif_status ON notifications(status, next_retry_at);

CREATE TABLE audit_logs (
  id INTEGER PRIMARY KEY,
  action TEXT NOT NULL,
  actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_role TEXT,
  target_type TEXT NOT NULL,
  target_id TEXT,
  summary TEXT NOT NULL DEFAULT '',
  metadata_json TEXT,
  ip_hash TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_audit_target ON audit_logs(target_type, target_id, id);
CREATE INDEX idx_audit_created ON audit_logs(created_at);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  value_type TEXT NOT NULL DEFAULT 'string',
  is_secret INTEGER NOT NULL DEFAULT 0,
  requires_review INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'default' CHECK (source IN ('default','env','admin','migration'))
);

CREATE TABLE rate_limits (
  bucket TEXT NOT NULL,
  scope_hash TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (bucket, scope_hash, window_start)
);

CREATE TABLE reservations (
  token TEXT PRIMARY KEY,
  cart_key TEXT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  consumed_at TEXT
);

CREATE TABLE reservation_lines (
  id INTEGER PRIMARY KEY,
  reservation_token TEXT NOT NULL REFERENCES reservations(token) ON DELETE CASCADE,
  variant_id INTEGER NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  UNIQUE (reservation_token, variant_id)
);
CREATE INDEX idx_res_lines_variant ON reservation_lines(variant_id);
`,
);


/* ------------------------------------------------------------------ 004 csrf */
push(
  'session-csrf-token',
  `ALTER TABLE sessions ADD COLUMN csrf_token TEXT NOT NULL DEFAULT '';
   CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);`,
);

/* ---------------------------------------------------- 005 newsletter subscribers */
push(
  'newsletter-subscribers',
  `
CREATE TABLE newsletter_subscribers (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'subscribed' CHECK (status IN ('subscribed','unsubscribed','bounced')),
  source TEXT NOT NULL DEFAULT 'homepage',
  consent_text TEXT NOT NULL,
  consent_at TEXT NOT NULL,
  ip_hash TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_newsletter_status ON newsletter_subscribers(status, created_at);
`,
);

export const migrations = M;

export function runMigrations(): { applied: number; total: number; versions: number[] } {
  exec(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       version INTEGER PRIMARY KEY,
       name TEXT NOT NULL,
       applied_at TEXT NOT NULL
     )`,
  );
  const applied: number[] = [];
  for (const m of M) {
    const row = get<{ version: number }>('SELECT version FROM schema_migrations WHERE version = ?', [
      m.version,
    ]);
    if (row) continue;
    // Each migration runs in its own transaction so a failure cannot half-apply.
    exec('BEGIN IMMEDIATE');
    try {
      exec(m.sql);
      run('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)', [
        m.version,
        m.name,
        new Date().toISOString(),
      ]);
      exec('COMMIT');
      applied.push(m.version);
    } catch (err) {
      exec('ROLLBACK');
      throw new Error(`Migration ${String(m.version)} (${m.name}) failed: ${String(err)}`);
    }
  }
  return { applied: applied.length, total: M.length, versions: applied };
}

export function migrationStatus(): { version: number; name: string; applied: boolean }[] {
  return M.map((m) => ({
    version: m.version,
    name: m.name,
    applied: Boolean(get('SELECT 1 AS x FROM schema_migrations WHERE version = ?', [m.version])),
  }));
}
