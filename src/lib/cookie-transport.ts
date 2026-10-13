/**
 * Cookie transport rules, kept free of any framework import so they can be tested directly.
 *
 * `Secure` must follow the protocol of the request that is setting the cookie. Reading it off
 * NODE_ENV looks equivalent and is not: a production build reached over plain http - a preview
 * proxy, a tunnel, a LAN address - then marks its session and CSRF cookies Secure, the browser
 * drops them without a word, sign-in appears to succeed, and every later write fails its
 * double-submit check with an error the shopper cannot act on. That is how "Add to bag" broke.
 */
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

/** The options for a cookie being set by this request, with `secure` decided by that request. */
export function cookieOptionsFor(req: Request, opts: { httpOnly?: boolean } = {}) {
  return { ...sessionCookieOptions, ...opts, secure: requestIsHttps(req) };
}

/** The basket is not a credential, but a dropped one loses the customer's cart all the same. */
export function cartCookieOptionsFor(req: Request) {
  return { ...cartCookieOptions, secure: requestIsHttps(req) };
}
