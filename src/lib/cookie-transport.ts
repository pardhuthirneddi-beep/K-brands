/**
 * Cookie transport rules, kept free of any framework import so they can be tested directly.
 *
 * `Secure` must follow the protocol of the request that is setting the cookie. Reading it off
 * NODE_ENV looks equivalent and is not: a production build reached over plain http - a preview
 * proxy, a tunnel, a LAN address - then marks its session and CSRF cookies Secure, the browser
 * drops them without a word, sign-in appears to succeed, and every later write fails its
 * double-submit check with an error the shopper cannot act on. That is how "Add to bag" broke.
 */
import { previewEmbedEnabled } from './env.ts';

const secureDefault = process.env.NODE_ENV === 'production';

export function requestIsHttps(req: Request): boolean {
  const fwd = req.headers.get('x-forwarded-proto');
  if (fwd) return (fwd.split(',')[0] ?? '').trim().toLowerCase() === 'https';
  try {
    return new URL(req.url).protocol === 'https:';
  } catch {
    return secureDefault;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: secureDefault,
  path: '/',
  maxAge: 60 * 60 * 24 * 14,
} as const;

export const cartCookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: secureDefault,
  path: '/',
  maxAge: 60 * 60 * 24 * 60,
} as const;

/**
 * Arena frames the HTTPS demo from another site. SameSite=Lax cookies are not sent in a third-party
 * iframe, so even the one-click owner login and add-to-bag silently fail there. CHIPS lets modern
 * browsers keep a Secure, SameSite=None cookie partitioned under the Arena top-level site. This
 * exception applies only to the explicit non-live E2B preview *and* an HTTPS request; HTTP localhost
 * and every live store retain Lax, unpartitioned cookies.
 */
export function cookieTransportFor(req: Request) {
  const secure = requestIsHttps(req);
  const partitioned = previewEmbedEnabled && secure;
  return { secure, sameSite: partitioned ? ('none' as const) : ('lax' as const), partitioned };
}

/** The options for a cookie being set by this request, shared by login/register/demo-owner/logout. */
export function cookieOptionsFor(req: Request, opts: { httpOnly?: boolean } = {}) {
  return { ...sessionCookieOptions, ...opts, ...cookieTransportFor(req) };
}

/** The basket is not a credential, but a dropped one loses the customer's cart all the same. */
export function cartCookieOptionsFor(req: Request) {
  return { ...cartCookieOptions, ...cookieTransportFor(req) };
}
