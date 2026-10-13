import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ensureDb } from '@/lib/bootstrap.ts';
import { readUser } from '@/lib/session.ts';
import { isAdmin } from '@/domain/auth.ts';
import { Wordmark } from '@/components/site/wordmark.tsx';
import { AdminNav } from '@/components/admin/admin-nav.tsx';
import { Badge } from '@/components/ui/badge.tsx';
import * as env from '@/lib/env.ts';

ensureDb();
export const dynamic = 'force-dynamic';

export const metadata = {
  title: { default: 'Admin — K-brands', template: '%s — Admin — K-brands' },
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await readUser();
  // Server-side gate for the whole area. Every handler re-checks; the nav is not
  // the security boundary.
  if (!user) redirect('/account/login?next=/admin');
  if (!isAdmin(user)) redirect('/account');
  return (
    <div className="min-h-screen bg-ivory-200/40">
      <header className="sticky top-0 z-40 border-b border-ink-700 bg-ink text-ivory-100">
        <div className="flex h-[58px] items-center gap-4 px-4 lg:px-6">
          <Link href="/admin" className="flex items-center gap-3">
            <Wordmark tone="ivory" size="sm" />
            <span className="rounded-xs bg-ivory-100/12 px-1.5 py-0.5 text-[11.5px] uppercase tracking-widest text-ivory-100/80">
              Admin
            </span>
          </Link>
          <div className="ml-auto flex items-center gap-3 text-[12px]">
            {!env.liveCommerceEnabled ? (
              <Badge tone="warn" className="border-transparent">
                Live commerce off
              </Badge>
            ) : (
              <Badge tone="ok" className="border-transparent">
                Live commerce on
              </Badge>
            )}
            <Link href="/" className="text-ivory-100/70 underline-offset-4 hover:text-ivory-100 hover:underline">
              View store
            </Link>
            <span className="hidden text-ivory-100/50 sm:inline">{user.email}</span>
          </div>
        </div>
      </header>
      <div className="flex flex-col lg:flex-row">
        <AdminNav />
        <main className="min-w-0 flex-1 px-4 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
