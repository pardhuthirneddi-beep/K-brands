/**
 * End-to-end smoke check against a running server — `npm run e2e:smoke`.
 *
 *   SMOKE_URL=http://localhost:3000 npm run e2e:smoke
 *
 * It is skipped rather than failed when no server answers, so `npm test` stays usable
 * without a running build. What it checks is the shortlist of things that a typecheck
 * cannot see: the pages return 200 *with real content* (not an error shell), the
 * catalogue contains menswear only, the demo labelling survives to the HTML, and the
 * admin API refuses an unauthenticated caller.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const BASE = process.env.SMOKE_URL ?? 'http://localhost:3000';
let alive = false;
try {
  const res = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(2500) });
  alive = res.ok;
} catch {
  alive = false;
}

const get = (p: string) => fetch(`${BASE}${p}`, { redirect: 'manual' });

test('storefront pages render with content', { skip: alive ? false : `no server at ${BASE}` }, async () => {
  for (const path of ['/', '/shop', '/shop?tag=new', '/collections/shirts', '/collections/linen-shirts', '/cart', '/size-guide']) {
    const res = await get(path);
    assert.equal(res.status, 200, `${path} should be 200, saw ${String(res.status)}`);
    const html = await res.text();
    assert.ok(html.length > 4000, `${path} rendered an implausibly small document (${String(html.length)} bytes)`);
  }
});

test('the catalogue that reaches the browser is menswear only', { skip: alive ? false : 'no server' }, async () => {
  const html = await (await get('/shop')).text();
  for (const banned of ['belt', 'wallet', 'sneaker', 'handbag', 'wristwatch', 'women', 'ladies']) {
    assert.ok(
      !new RegExp(`>[^<]*\\b${banned}s?\\b`, 'i').test(html),
      `the storefront listing must not present "${banned}" as merchandise`,
    );
  }
  assert.match(html, /Shirts|Linen|Trousers/, 'the listing should show the approved categories');
});

test('demo content is labelled as demo in the rendered page', { skip: alive ? false : 'no server' }, async () => {
  const html = await (await get('/')).text();
  assert.match(html, /Demo|demo/, 'the homepage must carry the demo labelling the brief requires');
  assert.match(html, /Shop New Arrivals/, 'the primary hero CTA should be present');
});

test('unauthenticated admin mutations are refused, not silently allowed', { skip: alive ? false : 'no server' }, async () => {
  const res = await fetch(`${BASE}/api/admin/stock`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ variantId: 1, quantity: 500 }),
  });
  assert.equal(res.status, 401);
  const body = (await res.json()) as { error?: string };
  assert.match(String(body.error), /sign in/i);
});

test('a broken product URL does not return a plausible-looking empty page', { skip: alive ? false : 'no server' }, async () => {
  const res = await get('/product/this-does-not-exist');
  const html = await res.text();
  assert.match(html, /not found|404|could not find/i, 'unknown slugs should surface the not-found UI');
});
