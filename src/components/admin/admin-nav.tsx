'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const GROUPS: { title: string; links: { href: string; label: string }[] }[] = [
  { title: 'Overview', links: [{ href: '/admin', label: 'Dashboard' }] },
  {
    title: 'Catalogue',
    links: [
      { href: '/admin/products', label: 'Products' },
      { href: '/admin/inventory', label: 'Inventory' },
      { href: '/admin/coupons', label: 'Discount codes' },
    ],
  },
  {
    title: 'Orders',
    links: [
      { href: '/admin/orders', label: 'All orders' },
      { href: '/admin/returns', label: 'Returns & refunds' },
      { href: '/admin/customers', label: 'Customers' },
    ],
  },
  {
    title: 'Store setup',
    links: [
      { href: '/admin/settings', label: 'Settings & readiness' },
      { href: '/admin/notifications', label: 'Notifications' },
      { href: '/admin/audit', label: 'Audit log' },
    ],
  },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin" className="border-b border-stone-200 bg-white/70 lg:sticky lg:top-16 lg:h-[calc(100vh-4rem)] xl:top-[72px] xl:h-[calc(100vh-72px)] lg:w-[210px] lg:shrink-0 lg:border-b-0 lg:border-r lg:bg-transparent lg:p-4">
      <div className="flex gap-5 overflow-x-auto scroll-x px-4 py-3 lg:flex-col lg:gap-6 lg:overflow-visible lg:px-0 lg:py-0">
        {GROUPS.map((g) => (
          <div key={g.title} className="shrink-0">
            <p className="eyebrow mb-1.5 hidden lg:block">{g.title}</p>
            <ul className="flex gap-1 lg:flex-col lg:gap-0.5">
              {g.links.map((l) => {
                const active = l.href === '/admin' ? pathname === '/admin' : pathname.startsWith(l.href);
                return (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      aria-current={active ? 'page' : undefined}
                      className={`block whitespace-nowrap rounded-xs px-2.5 py-1.5 text-[13px] transition ${
                        active ? 'bg-ink text-ivory-100' : 'text-ink-600 hover:bg-stone-100'
                      }`}
                    >
                      {l.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}
