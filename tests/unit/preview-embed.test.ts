import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const url = (name: string) => pathToFileURL(path.join(ROOT, name)).href;

type Snapshot = {
  enabled: boolean;
  xfo: string | null;
  csp: string | null;
  https: { secure: boolean; sameSite: string; partitioned: boolean };
  http: { secure: boolean; sameSite: string; partitioned: boolean };
  cart: { secure: boolean; sameSite: string; partitioned: boolean };
};

/** next.config.ts and env.ts read switches at import time, so each case needs its own process. */
function inspect(overrides: Record<string, string | null>): Snapshot {
  const childEnv: NodeJS.ProcessEnv = { ...process.env };
  for (const [key, value] of Object.entries({
    NODE_ENV: 'production',
    KBRANDS_PREVIEW_EMBED: '1',
    KBRANDS_DEMO_CATALOGUE: '1',
    KBRANDS_LIVE_COMMERCE: '0',
    KBRANDS_DISABLE_CSP: null,
    E2B_SANDBOX_ID: 'unit-test-sandbox',
    ...overrides,
  })) {
    if (value === null) delete childEnv[key];
    else childEnv[key] = value;
  }
  const script = `
    const [{ default: config }, { previewEmbedEnabled }, { cookieOptionsFor, cartCookieOptionsFor }] =
      await Promise.all([
        import(${JSON.stringify(url('next.config.ts'))}),
        import(${JSON.stringify(url('src/lib/env.ts'))}),
        import(${JSON.stringify(url('src/lib/cookie-transport.ts'))})
      ]);
    const headers = Object.fromEntries((await config.headers())[0].headers.map(h => [h.key.toLowerCase(), h.value]));
    const https = new Request('http://localhost:3000/', { headers: { 'x-forwarded-proto': 'https' } });
    const http = new Request('http://localhost:3000/');
    console.log(JSON.stringify({
      enabled: previewEmbedEnabled,
      xfo: headers['x-frame-options'] ?? null,
      csp: headers['content-security-policy'] ?? null,
      https: cookieOptionsFor(https),
      http: cookieOptionsFor(http),
      cart: cartCookieOptionsFor(https)
    }));
  `;
  return JSON.parse(execFileSync(process.execPath, ['--experimental-strip-types', '-e', script], {
    cwd: ROOT,
    env: childEnv,
    encoding: 'utf8',
  }).trim()) as Snapshot;
}

function assertLocked(s: Snapshot) {
  assert.equal(s.enabled, false);
  assert.equal(s.xfo, 'DENY', 'live or unconfigured builds must never be framed');
  assert.match(s.csp ?? '', /frame-ancestors 'none'/);
  assert.deepEqual(
    { secure: s.https.secure, sameSite: s.https.sameSite, partitioned: s.https.partitioned },
    { secure: true, sameSite: 'lax', partitioned: false },
    'ordinary sessions stay first-party-only',
  );
}

test('the default production build remains unframeable, even if someone sets the preview switch', () => {
  assertLocked(inspect({ KBRANDS_DEMO_CATALOGUE: null }));
});

test('live commerce closes the frame exception even if the other switches are left on', () => {
  assertLocked(inspect({ KBRANDS_LIVE_COMMERCE: '1' }));
});

test('a demo outside E2B, or without explicit opt-in, remains unframeable', () => {
  assertLocked(inspect({ E2B_SANDBOX_ID: null }));
  assertLocked(inspect({ KBRANDS_PREVIEW_EMBED: null }));
});

test('only an opted-in, non-live E2B demo allows Arena framing and partitioned HTTPS cookies', () => {
  const s = inspect({ KBRANDS_DISABLE_CSP: '1' });
  assert.equal(s.enabled, true);
  assert.equal(s.xfo, null, 'DENY and SAMEORIGIN would both override CSP and break the iframe');
  assert.match(s.csp ?? '', /frame-ancestors 'self' https:\/\/arena\.ai https:\/\/\*\.arena\.ai/);
  assert.doesNotMatch(s.csp ?? '', /frame-ancestors \*/);
  assert.equal(s.https.sameSite, 'none');
  assert.equal(s.https.secure, true);
  assert.equal(s.https.partitioned, true);
  assert.equal(s.cart.sameSite, 'none');
  assert.equal(s.cart.partitioned, true);
  assert.deepEqual(
    { secure: s.http.secure, sameSite: s.http.sameSite, partitioned: s.http.partitioned },
    { secure: false, sameSite: 'lax', partitioned: false },
    'an HTTP localhost preview must never emit insecure SameSite=None or Partitioned cookies',
  );
  assert.ok(s.csp, 'a preview must keep its frame allowlist even if the CSP debug switch is set');
});
