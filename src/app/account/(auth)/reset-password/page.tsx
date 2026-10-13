import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthForm } from '@/components/account/auth-forms';
import { ensureDb } from '@/lib/bootstrap';
import { readUser } from '@/lib/session';

ensureDb();
export const dynamic = 'force-dynamic';

type PageProps = { searchParams: { [key: string]: string | string[] | undefined } };

/*
 * A human title for the tab, browser history and any share card. This used to fall back to the
 * route slug, which read as "reset-password - K-brands".
 */
export const metadata = {
  title: 'Reset password',
  description: 'Set a new password for your K-brands account.',
  robots: { index: false, follow: false },
};

export default async function Page(props: PageProps) {
  const user = await readUser();
  if (user) redirect('/account');

  /*
   * The token arrives from the emailed link. A missing or obviously truncated link is answered
   * with an explanation and a way to get a fresh one, rather than a 500 or a 404 that tells the
   * shopper nothing.
   */
  const token = String(props.searchParams.token ?? '');
  if (token.length < 16 && token.length > 0) {
    return (
      <div className="container grid min-h-[70vh] place-items-center py-10 sm:py-14">
        <div className="w-full max-w-[440px] border border-stone bg-white p-6">
          <h1 className="display-section text-[26px]">This reset link is not valid</h1>
          <p className="mt-2 text-[13.5px] leading-relaxed text-ink-500">
            Links expire after an hour and can only be used once. Request a new one and paste it
            into your browser&rsquo;s address bar rather than copying it from a preview.
          </p>
          <Link href="/account/forgot-password" className="btn-solid mt-5 w-full justify-center py-3">
            Request a new link
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container grid min-h-[70vh] place-items-center py-10 sm:py-14">
      {/*
        No Suspense boundary here on purpose: AuthForm reads the query itself, so the heading and
        the first field arrive in the same response instead of after a skeleton.
      */}
      <AuthForm mode="reset" initialToken={token} />
    </div>
  );
}
