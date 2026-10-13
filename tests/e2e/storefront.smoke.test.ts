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

test('no collection or product page is fronted by an illustration', { skip: alive ? false : 'no server' }, async () => {
  const shop = await (await get('/shop')).text();
  const slugs = [...new Set((shop.match(/href="\/product\/([a-z0-9-]+)"/g) ?? []).map((x) => (x.split('/product/')[1] ?? '').replace('"', '')))];
  assert.ok(slugs.length >= 5, 'expected the listing to link several products');
  assert.ok(!shop.includes('/media/sample/'), 'listing cards must not show generated art while photographs exist');
  for (const slug of slugs.slice(0, 8)) {
    const page = await (await get(`/product/${slug}`)).text();
    const art = (page.match(/src="\/media\/sample\//g) ?? []).length;
    const photo = (page.match(/\/media\/demo\/[a-z0-9-]+\.(jpg|png)/g) ?? []).length;
    assert.ok(photo > 0, `/product/${slug} renders no product imagery at all`);
    assert.equal(art, 0, `/product/${slug} shows ${String(art)} illustration frame(s); only photography may be offered`);
  }
});

test('photography is delivered through the image optimiser with responsive candidates', { skip: alive ? false : 'no server' }, async () => {
  const html = await (await get('/shop')).text();
  assert.match(html, /_next\/image\?url=/, 'card images should be resized and modern-formatted, not raw JPEG');
  // Next writes the attribute as `srcSet` in the document. What matters is that the small
  // candidates are offered at all: without them a 360px phone downloads the 1536w frame.
  assert.match(html, /srcSet=/i, 'responsive candidates must be advertised');
  assert.match(html, /sizes="\(/, 'the card must tell the browser how wide the slot really is');
  // Attribute values are HTML-escaped, so the separator in these URLs is "&amp;", not "&".
  const widths = new Set([...html.matchAll(/w=(\d+)/g)].map((m) => Number(m[1])));
  assert.ok(widths.size >= 4, `expected several candidate widths, saw ${[...widths].join(', ')}`);
  assert.ok(Math.min(...widths) <= 360, `smallest candidate is ${String(Math.min(...widths))}w — too large for a phone`);
  assert.match(html, /loading="lazy"|fetchpriority="high"/, 'below-the-fold imagery must defer');

  // The product page is the heaviest image surface on the site, so it goes through the same path.
  const pdp = await (await get('/product/pure-linen-shirt')).text();
  assert.match(pdp, /_next\/image\?url=/, 'the main product frame must be served by the optimiser');
  assert.match(pdp, /srcSet=/i, 'the main frame needs its own responsive candidates');
  assert.equal((pdp.match(/src="\/media\/sample\//g) ?? []).length, 0, 'a photographed product page must not render a plate');
});

test('mobile contract: viewport, overflow guard and header clearance are compiled in', { skip: alive ? false : 'no server' }, async () => {
  const html = await (await get('/')).text();
  assert.match(html, /name="viewport" content="width=device-width/);
  const cssHref = html.match(/\/_next\/static\/css\/[a-z0-9]+\.css/i)?.[0];
  assert.ok(cssHref, 'no stylesheet link found');
  const css = await (await fetch(`${BASE}${cssHref}`)).text();
  assert.match(css, /overflow-x:clip|overflow-x: clip/, 'a stray fixed width must not create a sideways scrollbar');
  assert.match(css, /scroll-padding-top/, 'anchors must clear the sticky header');
  assert.match(css, /prefers-reduced-motion/, 'motion must be optional');
  assert.match(css, /min-height:44px|min-height:2\.75rem/, 'touch targets of at least 44px');
  // 16px on inputs is not taste: below it iOS Safari zooms the page on focus, and a zoomed checkout
  // has to be panned sideways to type into.
  assert.match(css, /\.field\{[^}]*font-size:16px/, 'checkout fields must stay at 16px for iOS');
});

test('accessibility basics survive into the rendered document', { skip: alive ? false : 'no server' }, async () => {
  const html = await (await get('/')).text();
  assert.equal((html.match(/<h1[\s>]/g) ?? []).length, 1, 'exactly one h1 per page');
  assert.match(html, /href="#main"/, 'a skip link must exist');
  assert.match(html, /id="main"[^>]*tabindex="-1"/, 'the skip target must be focusable');
  assert.match(html, /<nav aria-label="Primary"/, 'the navigation needs an accessible name');
  assert.match(html, /aria-label="(Your account|Login to your account)"/, 'the account control must be named');
});

test('the login affordance says Login and the tab title is not a route slug', { skip: alive ? false : 'no server' }, async () => {
  const home = await (await get('/')).text();
  assert.match(home, /Login<\/span>|>Login<|Login to your account/, 'a signed-out visitor must see a Login control');
  const login = await (await get('/account/login')).text();
  assert.match(login, /<title>[^<]*Login[^<]*<\/title>/, 'the document title should read Login, not "login"');
  assert.match(login, /<h1[^>]*>\s*Login/, 'the page must announce itself as Login');
});

test('a broken product URL does not return a plausible-looking empty page', { skip: alive ? false : 'no server' }, async () => {
  const res = await get('/product/this-does-not-exist');
  const html = await res.text();
  assert.match(html, /not found|404|could not find/i, 'unknown slugs should surface the not-found UI');
});
