/**
 * Button and link wording: every control must say what it does. These strings were the
 * subject of explicit owner feedback ("the login control must say Login"), so they are
 * pinned here rather than left to review.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

test('the auth form calls the sign-in action Login, not a subscription word', () => {
  const s = read('src/components/account/auth-forms.tsx');
  assert.match(s, /cta: 'Login'/);
  assert.doesNotMatch(s, /cta: 'Subscribe'/);
});

test('the header offers Login to a visitor and Account to a member', () => {
  const s = read('src/components/site/account-menu.tsx');
  assert.match(s, /'Login'/, 'a guest must see a login affordance');
  assert.match(s, /aria-label=\{user \? 'Your account' : 'Login to your account'\}/);
});

test('account screens carry human page titles instead of route slugs', () => {
  for (const [route, title] of [
    ['login', 'Login'],
    ['register', 'Create an account'],
    ['forgot-password', 'Forgot password'],
    ['reset-password', 'Reset password'],
  ] as const) {
    const s = read(`src/app/account/(auth)/${route}/page.tsx`);
    assert.match(s, new RegExp(`title: '${title}'`), `${route} should title as "${title}"`);
    assert.doesNotMatch(s, new RegExp(`title: '${route}'`), `${route} must not render its slug`);
  }
});

test('colourway wording agrees with its count', () => {
  const s = read('src/components/product/product-card.tsx');
  assert.match(s, /colors.length === 1 \? 'colourway' : 'colourways'/);
});

test('card controls are reachable without a mouse or a hover', () => {
  // An action button that only appears on hover is invisible on touch, and an invisible
  // button is worse than none: it reads as a dead card. The quick view must therefore be
  // shown by default and only fade in on hover for pointer devices.
  const s = read('src/components/product/product-card.tsx');
  assert.match(s, /opacity-100 lg:opacity-0/, 'mobile must see the control');
  assert.match(s, /focus-visible:opacity-100/, 'keyboard focus must reveal it');
});

test('a guest order page withholds the delivery address until the email is confirmed', () => {
  const page = read('src/app/order/[number]/page.tsx');
  // The address block must be conditional on the confirmation, not on the row existing.
  assert.match(
    page,
    /address && contactConfirmed \? \(/,
    'the delivery address must not render for an unconfirmed guest view',
  );
  // Same for the contact email: the whole sentence is gated, not just the address card.
  assert.match(page, /const emailCopy = !contactConfirmed/, 'the contact email line must be gated');

  // And the receipt may only claim an email was sent when the transport says it was.
  const copy = page.slice(page.indexOf('const emailCopy'), page.indexOf('const tracking ='));
  assert.ok(copy.length > 0 && copy.includes('emailCopy'), 'emailCopy block not found');
  assert.ok(
    copy.indexOf("=== 'sent'") < copy.indexOf('confirmation sent to'),
    '"confirmation sent to" must only appear on the sent branch',
  );
  assert.match(copy, /no confirmation email was sent/, 'an unconfigured transport must be admitted');

  // And the confirmation itself must not be a free oracle for testing email/order pairs.
  assert.match(page, /consume\('order_verify'/, 'the email check needs a rate limit');
  assert.match(page, /httpOnly: true/, 'the confirmation cookie must not be readable by scripts');
});
