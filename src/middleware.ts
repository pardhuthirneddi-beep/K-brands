import { NextResponse, type NextRequest } from 'next/server';
import { cookieTransportFor } from '@/lib/cookie-transport.ts';

/**
 * Middleware responsibilities (kept deliberately thin — no DB access here so it
 * can stay on the edge runtime):
 *  1. Guarantee a double-submit CSRF cookie exists for every visitor (guests
 *     included), so mutating API calls can be verified without a session.
 *  2. Send visitors with no session cookie at all straight to the sign-in page for the
 *     /account and /admin areas, so a protected URL is a redirect rather than a page that
 *     paints an empty shell and moves later. NOTE: the *presence* of the cookie is not
 *     authorization — every admin handler and page re-verifies the session and the role
 *     server-side, which is also what handles a cookie that exists but has expired.
 */
export const config = {
  matcher: ['/((?!media/sample|_next/static|_next/image|favicon.ico).*)'],
};

const CSRF_COOKIE = 'kb_csrf';
const SESSION_COOKIE = 'kb_session';

/** Screens a signed-out visitor must be able to reach, and the only ones under /account. */
const PUBLIC_AUTH_PAGES = new Set([
  '/account/login',
  '/account/register',
  '/account/forgot-password',
  '/account/reset-password',
]);

function isProtectedArea(pathname: string): boolean {
  if (PUBLIC_AUTH_PAGES.has(pathname)) return false;
  return pathname === '/account' || pathname.startsWith('/account/') || pathname === '/admin' || pathname.startsWith('/admin/');
}

/**
 * Middleware runs on the edge runtime, so `node:crypto` is not available here —
 * `crypto.randomUUID()` on the Web Crypto API is, and it is exactly as strong.
 * 24 bytes rendered as base64url matches the token shape the server-side
 * verifier expects (it only compares the value, never parses it).
 */
function randomToken(): string {
  const bytes = new Uint8Array(24);
  globalThis.crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const existing = req.cookies.get(CSRF_COOKIE)?.value;
  if (!existing || existing.length < 24) {
    // Use the same transport policy as the session. The proxy's x-forwarded-proto decides Secure;
    // in an HTTPS Arena iframe the CSRF token must also be partitioned or every write loses it.
    res.cookies.set(CSRF_COOKIE, randomToken(), {
      ...cookieTransportFor(req),
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
      httpOnly: false,
    });
  }
  if (isProtectedArea(req.nextUrl.pathname) && !req.cookies.get(SESSION_COOKIE)?.value) {
    const url = req.nextUrl.clone();
    url.pathname = '/account/login';
    url.search = '';
    // Always a path on this site; AuthForm refuses anything that is not before it is used.
    url.searchParams.set('next', req.nextUrl.pathname + (req.nextUrl.search || ''));
    return NextResponse.redirect(url, 307);
  }
  const origin = req.headers.get('origin');
  if (origin && req.method !== 'GET' && req.method !== 'HEAD') {
    /*
     * Same-site check for writes. A reverse proxy normally rewrites Host to the upstream address, so
     * comparing the browser's origin against Host alone rejects the site's own traffic - in this
     * preview that is every "Add to bag". Any of the names this deployment is reachable by is
     * accepted (Host, X-Forwarded-Host), matched without the port because a proxy may drop or add one.
     * A foreign origin still matches none of them, which is what the check is for.
     */
    const host = req.headers.get('host');
    const forwardedHost = req.headers.get('x-forwarded-host');
    const known = [host, forwardedHost].filter((v): v is string => Boolean(v));
    const stripPort = (v: string) => v.replace(/:\d+$/, '');
    let originHost = '';
    try {
      originHost = new URL(origin).host;
    } catch {
      originHost = '';
    }
    const sameSite = originHost !== '' && known.some((h) => h === originHost || stripPort(h) === stripPort(originHost));
    if (!sameSite) {
      return NextResponse.json({ error: 'Cross-origin write blocked.' }, { status: 403 });
    }
  }
  return res;
}
