import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { AuthForm } from '@/components/account/auth-forms.tsx';
import { ensureDb } from '@/lib/bootstrap.ts';
import { readUser } from '@/lib/session.ts';

ensureDb();
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'forgot-password',
  robots: { index: false, follow: false },
};

export default async function Page() {
  const user = await readUser();
  // Signed-in visitors skip straight to the account area (except when resetting).
  if (user) redirect('/account');
  return (
    <div className="container grid min-h-[60vh] place-items-center py-14">
      <Suspense fallback={<p className="text-[13px] text-ink-400">Loading…</p>}>
        <AuthForm mode="forgot" />
      </Suspense>
    </div>
  );
}
