import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { isAdmin, resolveSession, type AuthenticatedUser } from '../domain/auth.ts';
import { AppError } from './errors.ts';

export const SESSION_COOKIE = 'kb_session';
export const CART_COOKIE = 'kb_cart';
export const CSRF_HEADER = 'x-csrf-token';

/*
 * Cookie transport rules live in ./cookie-transport.ts so they can be unit-tested without the Next
 * runtime (this module imports next/headers). Re-exported here because every caller already
 * imports its cookie options from this file.
 */
export {
  sessionCookieOptions,
  cartCookieOptions,
  cookieOptionsFor,
  cartCookieOptionsFor,
  requestIsHttps,
} from './cookie-transport.ts';

/** Read-only cookie access. Writing happens in route handlers (Next constraint). */
export async function readSessionToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value ?? null;
}

export async function readUser(): Promise<AuthenticatedUser | null> {
  const token = await readSessionToken();
  if (!token) return null;
  try {
    return resolveSession(token);
  } catch {
    return null;
  }
}

export async function requireUser(next?: string): Promise<AuthenticatedUser> {
  const user = await readUser();
  if (!user) {
    if (next) redirect(`/account/login?next=${encodeURIComponent(next)}`);
    throw new AppError('unauthorized', 'Please sign in to continue.', 401);
  }
  return user;
}

/**
 * Server-component guard for the admin area.
 *
 * The admin layout checks the role too, but that is not sufficient on its own: with
 * streaming, a page whose data resolves before the layout's redirect is thrown can
 * still have HTML flushed to the browser. So every admin page calls this before it
 * reads a single row, and the redirect happens in the page itself.
 */
export async function requireAdminPage(next = '/admin'): Promise<AuthenticatedUser> {
  const user = await readUser();
  if (!user) redirect(`/account/login?next=${encodeURIComponent(next)}`);
  if (!isAdmin(user)) redirect('/account');
  return user;
}

export async function requireAdminUser(): Promise<AuthenticatedUser> {
  const user = await readUser();
  if (!user) throw new AppError('unauthorized', 'Please sign in to continue.', 401);
  if (!isAdmin(user)) throw new AppError('forbidden', 'You do not have access to this area.', 403);
  return user;
}

export async function readCartKey(user: AuthenticatedUser | null): Promise<string | null> {
  if (user) return `user:${user.id}`;
  const store = await cookies();
  return store.get(CART_COOKIE)?.value ?? null;
}

export function newCartKey(): string {
  return `guest:${crypto.randomBytes(16).toString('base64url')}`;
}
