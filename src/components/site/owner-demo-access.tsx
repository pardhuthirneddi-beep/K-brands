import Link from 'next/link';
import { demoOwnerAccessEnabled } from '@/lib/env.ts';

/*
 * A one-click door into the owner area, rendered only while the build is a demo (see
 * `demoOwnerAccessEnabled` - demo catalogue on, live commerce off). It posts a form rather than
 * calling fetch, so it works with JavaScript disabled and needs no client bundle for a control that
 * exists on exactly one kind of deployment.
 *
 * What it deliberately does not do is carry a password: the credentials live in the server environment
 * and the button only asks the server to sign the configured owner in. Anyone who can see this bar is
 * already looking at a build whose whole catalogue is demo data.
 */
export function OwnerDemoAccess({ isAdmin }: { isAdmin: boolean }) {
  if (!demoOwnerAccessEnabled) return null;
  if (isAdmin) {
    return (
      <div className="border-b border-line bg-ink px-4 text-ivory-200">
        <div className="mx-auto flex max-w-page flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-1.5 text-center text-[12.5px] leading-snug">
          <span>You are signed in as the owner in this demo.</span>
          <Link href="/admin" className="font-semibold text-ivory-100 underline decoration-sand-500 decoration-2 underline-offset-2">
            Open the owner dashboard
          </Link>
        </div>
      </div>
    );
  }
  return (
    <div className="border-b border-line bg-ink px-4 text-ivory-200">
      <div className="mx-auto flex max-w-page flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-1.5 text-center text-[12.5px] leading-snug">
        <span>Demo build — every order placed here is a test order and no payment is taken.</span>
        <form method="post" action="/api/auth/demo-owner" className="contents">
          <button
            type="submit"
            className="min-h-[36px] rounded-xs bg-ivory-100 px-3.5 py-1.5 text-[12.5px] font-semibold text-ink transition-colors hover:bg-ivory-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sand-500"
          >
            Open the owner dashboard
          </button>
        </form>
      </div>
    </div>
  );
}
