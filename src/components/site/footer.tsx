import Link from 'next/link';
import { WordmarkLockup } from './wordmark.tsx';
import { settingsForUi } from '@/domain/settings.ts';
import { ReviewBadge } from '../ui/badge.tsx';

const GROUPS: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: 'Shop',
    links: [
      { href: '/shop', label: 'Shop all' },
      { href: '/collections/shirts', label: 'Shirts' },
      { href: '/collections/trousers', label: 'Trousers' },
      { href: '/collections/knitwear', label: 'Knitwear' },
      { href: '/collections/blazers-jackets', label: 'Blazers & jackets' },
      { href: '/search', label: 'Search' },
    ],
  },
  {
    title: 'Help',
    links: [
      { href: '/faq', label: 'FAQs' },
      { href: '/contact', label: 'Contact us' },
      { href: '/size-guide', label: 'Size guide' },
      { href: '/account/orders', label: 'Order tracking' },
    ],
  },
  {
    title: 'Policies',
    links: [
      { href: '/policies/shipping', label: 'Shipping' },
      { href: '/policies/returns', label: 'Returns & exchanges' },
      { href: '/policies/cancellation', label: 'Cancellation' },
      { href: '/policies/refund', label: 'Refunds' },
      { href: '/policies/privacy', label: 'Privacy' },
      { href: '/policies/terms', label: 'Terms of use' },
    ],
  },
];

export function SiteFooter() {
  const s = settingsForUi();
  const identityIncomplete = !s.legalEntityName || !s.supportEmail;
  return (
    <footer className="mt-20 border-t border-stone-200 bg-ivory-200/60">
      <div className="container py-12 lg:py-16">
        <div className="grid gap-10 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div className="max-w-sm">
            <WordmarkLockup />
            <p className="mt-4 text-[13px] leading-relaxed text-ink-500">
              {s.tagline ?? 'Contemporary menswear built around the working week.'}
            </p>
            <p className="mt-4 text-[12px] leading-relaxed text-ink-400">
              Currently in pre-launch build: sample catalogue, no payment provider connected, shipping and returns
              settings awaiting owner approval.
            </p>
            {identityIncomplete ? (
              <div className="mt-4">
                <ReviewBadge label="Seller identity & contact details pending" />
              </div>
            ) : (
              <address className="mt-4 text-[12px] not-italic leading-relaxed text-ink-500">
                {s.legalEntityName ? <span className="block">{s.legalEntityName}</span> : null}
                {s.supportEmail ? <span className="block">{s.supportEmail}</span> : null}
                {s.gstin ? <span className="block">GSTIN: {s.gstin}</span> : null}
              </address>
            )}
          </div>
          {GROUPS.map((g) => (
            <nav key={g.title} aria-label={g.title}>
              <h2 className="eyebrow">{g.title}</h2>
              <ul className="mt-3 space-y-2">
                {g.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="text-[13px] text-ink-600 transition hover:text-ink hover:underline hover:underline-offset-4">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="mt-12 flex flex-col gap-3 border-t border-stone-200 pt-6 text-[11.5px] leading-relaxed text-ink-400 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} K-brands. All rights reserved.</p>
          <p>
            Prices in {s.currency}. Delivery within India only at this stage.{' '}
            {s.returnsEnabled ? 'Returns per the published policy.' : 'Returns policy not yet published.'}
          </p>
        </div>
      </div>
    </footer>
  );
}
