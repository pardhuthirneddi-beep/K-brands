'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

const LINKS = [
  { href: '/account', label: 'Overview' },
  { href: '/account/orders', label: 'Orders' },
  { href: '/account/addresses', label: 'Addresses' },
  { href: '/account/returns', label: 'Returns & requests' },
  { href: '/account/profile', label: 'Profile & security' },
];

export function AccountNav() {
  const pathname = usePathname();
  const router = useRouter();
  async function signOut() {
    try {
      const csrf = document.cookie.match(/kb_csrf=([^;]+)/)?.[1];
      await fetch('/api/auth/logout', { method: 'POST', headers: csrf ? { 'x-csrf-token': csrf } : {}, credentials: 'same-origin' });
    } finally {
      router.push('/');
      router.refresh();
    }
  }
  return (
    <nav aria-label="Account" className="lg:sticky lg:top-24 lg:self-start">
      <ul className="flex gap-1 overflow-x-auto scroll-x lg:flex-col lg:gap-0.5">
        {LINKS.map((l) => {
          const active = l.href === '/account' ? pathname === '/account' : pathname.startsWith(l.href);
          return (
            <li key={l.href}>
              <Link
                href={l.href}
                aria-current={active ? 'page' : undefined}
                className={`block whitespace-nowrap border-l-2 px-3 py-2 text-[13px] transition ${
                  active ? 'border-ink bg-white font-medium text-ink' : 'border-transparent text-ink-500 hover:border-stone-300 hover:text-ink'
                }`}
              >
                {l.label}
              </Link>
            </li>
          );
        })}
        <li>
          <button type="button" onClick={signOut} className="w-full px-3 py-2 text-left text-[13px] text-ink-600 transition hover:text-alert-error">
            Sign out
          </button>
        </li>
      </ul>
    </nav>
  );
}
