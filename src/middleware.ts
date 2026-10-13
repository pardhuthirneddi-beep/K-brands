import { NextResponse, type NextRequest } from 'next/server';

/**
 * Middleware responsibilities (kept deliberately thin — no DB access here so it
 * can stay on the edge runtime):
 *  1. Guarantee a double-submit CSRF cookie exists for every visitor (guests
 *     included), so mutating API calls can be verified without a session.
 *  2. Redirect obvious admin routes to sign-in early for a cleaner 401/redirect
 *     experience. NOTE: this is *not* the authorization check — every admin
 *     handler and page re-verifies the role server-side.
 */
export const config = {
  matcher: ['/((?!media/sample|_next/static|_next/image|favicon.ico).*)'],
};

const CSRF_COOKIE = 'kb_csrf';

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
    res.cookies.set(CSRF_COOKIE, randomToken(), {
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
      httpOnly: false,
    });
  }
  const origin = req.headers.get('origin');
  const host = req.headers.get('host');
  if (origin && host && req.method !== 'GET' && req.method !== 'HEAD') {
    try {
      if (new URL(origin).host !== host) {
        return NextResponse.json({ error: 'Cross-origin write blocked.' }, { status: 403 });
      }
    } catch {
      return NextResponse.json({ error: 'Cross-origin write blocked.' }, { status: 403 });
    }
  }
  return res;
}
