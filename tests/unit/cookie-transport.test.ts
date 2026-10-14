/**
 * Why this file exists: the storefront once set its session and CSRF cookies with `Secure` whenever
 * NODE_ENV was 'production', regardless of how the request arrived. Behind an http proxy or a tunnel
 * the browser silently dropped both, so signing in appeared to work and then "Add to bag" came back as
 * "Your session could not be verified" - a wall with no reason a shopper could act on. `Secure` now
 * follows the protocol of the request, and these tests pin that down.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

function read(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
}

// Imported from the module that owns the rules - it is framework-free precisely so this file can
// load it without the Next runtime.
const { requestIsHttps, cookieOptionsFor, sessionCookieOptions, cartCookieOptionsFor } = await import(
  '../../src/lib/cookie-transport.ts'
);

test('x-forwarded-proto is what decides Secure, not the build mode', () => {
  const httpsReq = new Request('http://localhost:3000/api/cart', { headers: { 'x-forwarded-proto': 'https' } });
  const httpReq = new Request('https://example.invalid/api/cart', { headers: { 'x-forwarded-proto': 'http' } });
  assert.equal(requestIsHttps(httpsReq), true, 'a proxied https request must get Secure cookies');
  assert.equal(requestIsHttps(httpReq), false, 'an explicit http request must not, or the cookie is dropped');
});

test('with no proxy header the URL the handler ran on decides', () => {
  assert.equal(requestIsHttps(new Request('https://kbrands.example/cart')), true);
  assert.equal(requestIsHttps(new Request('http://localhost:3000/cart')), false);
});

test('the options handed to the cookie jar keep the security flags that are not about transport', () => {
  // HTTP always takes the regular first-party policy, including inside an E2B preview; HTTPS preview
  // is deliberately different and has its own isolated-env tests in preview-embed.test.ts.
  const opts = cookieOptionsFor(new Request('http://localhost:3000/login'));
  assert.equal(opts.httpOnly, true, 'the session cookie must stay unreadable by scripts');
  assert.equal(opts.sameSite, 'lax');
  assert.equal(opts.path, '/');
  assert.equal(opts.maxAge, sessionCookieOptions.maxAge);
  // The CSRF cookie is the one thing scripts must read, by design (double-submit).
  assert.equal(cookieOptionsFor(new Request('http://localhost:3000/login'), { httpOnly: false }).httpOnly, false);
  // The basket is not a credential but must survive the same transport rules.
  assert.equal(cartCookieOptionsFor(new Request('http://localhost:3000/cart')).secure, false);
});

test('auth routes set cookies from the request, never from the static defaults', () => {
  for (const rel of ['src/app/api/auth/login/route.ts', 'src/app/api/auth/register/route.ts']) {
    const src = read(rel);
    assert.match(src, /cookieOptionsFor\(req\)/, `${rel} must mark Secure per-request`);
    assert.doesNotMatch(
      src,
      /sessionCookieOptions\)/,
      `${rel} must not fall back to the build-mode default, which is what lost the cookie behind http`,
    );
    // Login has to replace the CSRF cookie outright: an old guest value no longer matches the session.
    if (rel.includes('login')) assert.match(src, /cookies\.set\('kb_csrf', session\.csrfToken/);
  }
});

test('the same-site write check accepts the names a proxy hands us, and no others', () => {
  // Guarded behaviour, asserted at the source because middleware runs on the edge runtime: origin may
  // be the public name while Host is the upstream one, and both must be honoured.
  const mw = read('src/middleware.ts');
  assert.match(mw, /x-forwarded-host/, 'the proxy name has to be considered, or every write is refused');
  assert.match(mw, /cookieTransportFor\(req\)/, 'the CSRF cookie must share the session transport policy');
  assert.match(mw, /Cross-origin write blocked/, 'a foreign origin must still be rejected');
});
