import { AuthForm } from '@/components/account/auth-forms';
import { ensureDb } from '@/lib/bootstrap';
import { readUser } from '@/lib/session';

ensureDb();
export const dynamic = 'force-dynamic';

/*
 * A human title for the tab, browser history and any share card. This used to fall back to the
 * route slug, which read as "forgot-password - K-brands".
 */
export const metadata = {
  title: 'Create an account',
  description: 'Create a K-brands account to keep your addresses in one place and follow your orders.',
  robots: { index: false, follow: false },
};

export default async function Page() {

  return (
    <div className="container grid min-h-[70vh] place-items-center py-10 sm:py-14">
      {/*
        No Suspense boundary here on purpose: AuthForm reads ?next= at submit time, so the
        heading and the first field arrive in the same response instead of after a skeleton —
        no jump on a phone, and a heading the server actually announced.
      */}
      <AuthForm mode="register" />
    </div>
  );
}
