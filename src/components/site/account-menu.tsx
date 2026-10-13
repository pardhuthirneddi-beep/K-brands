import Link from 'next/link';

export function AccountMenu({ user }: { user: { name: string; role: string } | null }) {
  return (
    <Link
      href={user ? '/account' : '/account/login'}
      className="inline-flex h-9 items-center gap-1.5 rounded-xs px-2 text-[12px] tracking-label text-ink-600 transition hover:bg-white hover:text-ink"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.1">
        <circle cx="8" cy="5.2" r="2.9" />
        <path d="M2.4 14c.5-3 2.9-4.6 5.6-4.6S13.1 11 13.6 14" strokeLinecap="round" />
      </svg>
      <span className="hidden max-w-[9ch] truncate sm:inline">{user ? user.name.split(' ')[0] || 'Account' : 'Account'}</span>
      {user?.role === 'admin' ? (
        <span className="ml-0.5 hidden rounded-xs bg-ink px-1.5 py-0.5 text-[9px] tracking-widest text-ivory-100 sm:inline">
          ADMIN
        </span>
      ) : null}
    </Link>
  );
}
