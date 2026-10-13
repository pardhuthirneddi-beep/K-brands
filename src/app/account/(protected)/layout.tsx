import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ensureDb } from '@/lib/bootstrap.ts';
import { readUser } from '@/lib/session.ts';
import { AccountNav } from '@/components/account/account-nav.tsx';
import { isAdmin } from '@/domain/auth.ts';

ensureDb();
export const dynamic = 'force-dynamic';

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  /*
   * The guard lives here, in the (protected) group, and not in a layout that also wraps the
   * auth screens. When it wrapped /account/login as well, a signed-out visitor asking for the
   * login page was redirected to /account/login?next=/account — the same page — so the form was
   * never rendered. Route groups change nothing about the URL.
   */
  const user = await readUser();
  if (!user) redirect('/account/login?next=/account');
  return (
    <div className="container py-10 lg:py-14">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-stone-200 pb-5">
        <div>
          <p className="eyebrow">Your account</p>
          {/* Not an <h1>: every page below already announces itself, and a second top-level
              heading ahead of it makes the outline meaningless for a screen reader. */}
          <p className="display-section mt-1.5">Hello, {user.fullName.split(' ')[0] || 'there'}</p>
        </div>
        <div className="flex items-center gap-4 text-[12.5px]">
          {isAdmin(user) ? (
            <Link href="/admin" className="btn-solid px-4 py-2 text-[11.5px]">Admin dashboard</Link>
          ) : null}
          <span className="text-ink-600">{user.email}</span>
        </div>
      </header>
      <div className="grid gap-10 lg:grid-cols-[190px_1fr]">
        <AccountNav />
        <div>{children}</div>
      </div>
    </div>
  );
}
