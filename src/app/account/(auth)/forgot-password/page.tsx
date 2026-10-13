import { AuthForm } from '@/components/account/auth-forms';
import { ensureDb } from '@/lib/bootstrap';
import { readUser } from '@/lib/session';

ensureDb();
export const dynamic = 'force-dynamic';

/*
 * A human title for the tab, browser history and any share card. This used to fall back to the
 * route slug, which read as "forgot-password - K-brands".
 * These pages are never indexable, and the note stays out of the description.
 */
export const metadata = {
  title: 'Forgot password',
  description: 'Send yourself a one-time link to set a new K-brands password.',
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
      <AuthForm mode="forgot" />
    </div>
  );
}
