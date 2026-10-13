'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { useState } from 'react';
import Link from 'next/link';

const POLICY_LINKS: [string, string][] = [
  ['/policies/shipping', 'Shipping'],
  ['/policies/returns', 'Returns & exchanges'],
  ['/policies/cancellation', 'Cancellation'],
  ['/policies/refund', 'Refunds'],
  ['/policies/privacy', 'Privacy'],
  ['/policies/terms', 'Terms'],
];

type NavCategory = { slug: string; name: string; parent_slug: string | null; product_count: number };

export function NavSheet({ categories }: { categories: NavCategory[] }) {
  // Roots first, each followed by its non-empty children, so the mobile menu mirrors
  // the desktop tree instead of dumping a flat list.
  const links: { href: string; label: string; sub?: boolean }[] = [
    { href: '/shop?tag=new', label: 'New Arrivals' },
    ...categories
      .filter((c) => !c.parent_slug && c.product_count > 0)
      .flatMap((parent) => [
        { href: `/collections/${parent.slug}`, label: parent.name },
        ...categories
          .filter((kid) => kid.parent_slug === parent.slug && kid.product_count > 0)
          .map((kid) => ({ href: `/collections/${kid.slug}`, label: kid.name, sub: true })),
      ]),
    { href: '/shop', label: 'Shop All' },
    { href: '/search', label: 'Search' },
    { href: '/account/orders', label: 'Order tracking' },
    { href: '/account', label: 'My account' },
  ];
  const [open, setOpen] = useState(false);
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) document.body.style.overflow = '';
      }}
    >
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="inline-flex h-9 w-9 items-center justify-center rounded-xs border border-transparent text-ink transition hover:border-stone-300 lg:hidden"
        >
          <span className="sr-only">Open menu</span>
          <svg width="18" height="12" viewBox="0 0 18 12" aria-hidden="true" fill="none" stroke="currentColor">
            <path d="M0 1h18M0 6h18M0 11h12" strokeWidth="1.2" />
          </svg>
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-overlay bg-ink/35 backdrop-blur-[2px] data-[state=open]:animate-fade-in" />
        <Dialog.Content className="fixed inset-y-0 left-0 z-drawer flex w-[min(340px,86vw)] flex-col border-r border-line bg-ivory-50 shadow-card outline-none data-[state=open]:animate-fade-in">
          <div className="flex items-center justify-between border-b border-stone-200 px-5 py-4">
            <Dialog.Title className="font-display text-[17px]">Menu</Dialog.Title>
            <Dialog.Close asChild>
              <button type="button" className="text-[12px] tracking-label text-ink-500">
                Close
              </button>
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">Site navigation, search and account links</Dialog.Description>
          <nav className="flex-1 overflow-y-auto px-5 py-4" aria-label="Mobile">
            <ul className="space-y-1">
              {links.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={`block border-b border-line py-3 leading-tight text-ink transition hover:translate-x-1 hover:text-ink-500 ${
                      item.sub ? 'pl-4 font-sans text-[15px] text-ink-500' : 'font-display text-[20px]'
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mt-6 space-y-3 text-[12px] leading-relaxed text-ink-500">
              <p className="eyebrow">Policies</p>
              {POLICY_LINKS.map(([href, label]) => (
                <Link key={href} href={href} onClick={() => setOpen(false)} className="block underline-offset-4 hover:underline">
                  {label}
                </Link>
              ))}
            </div>
          </nav>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
