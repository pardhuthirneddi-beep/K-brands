import type { Metadata } from 'next';
import Link from 'next/link';
import { ensureDb } from '@/lib/bootstrap.ts';
import { productCount } from '@/domain/catalog.ts';
import { Badge, ReviewBadge } from '@/components/ui/badge.tsx';
import { settingsForUi } from '@/domain/settings.ts';

ensureDb();
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'About K-brands',
  description:
    'K-brands is a premium contemporary menswear label for young professionals in India. This page describes the brand direction and the current build status.',
  alternates: { canonical: '/about' },
};

export default async function AboutPage() {
  const s = settingsForUi();
  const counts = productCount();
  return (
    <>
      <section className="border-b border-stone-200 bg-ivory-200/50">
        <div className="container max-w-3xl py-14 lg:py-20">
          <p className="eyebrow">The label</p>
          <h1 className="display-hero mt-4 text-[clamp(2.1rem,5.6vw,3.9rem)]">
            Menswear that earns its place in a working week
          </h1>
          <p className="mt-6 text-[15.5px] leading-relaxed text-ink-600">
            K-brands is built for the young professional who is done with a wardrobe that splits into “office” and
            “everything else”. The range is deliberately mixed — shirting, trousers, knitwear, an unstructured jacket
            or two, and basics good enough to wear on their own — so a small number of pieces covers more occasions
            than a large number of novelty ones.
          </p>
        </div>
      </section>

      <section className="container grid gap-10 py-14 lg:grid-cols-[1fr_1fr] lg:py-20">
        <div className="space-y-8">
          <div>
            <h2 className="display-section mb-3">What we optimise for</h2>
            <ul className="space-y-3 text-[14.5px] leading-relaxed text-ink-600">
              {[
                ['Fabric before adjectives', 'Weight, composition and care are stated plainly. If we cannot verify it, it does not go on the page.'],
                ['Fit you can re-order', 'Measured size guides per garment type, so “M” means the same thing twice.'],
                ['Photography as documentation', 'Products should be shown as they are — including drape and how a collar behaves when it is not styled.'],
                ['Honest commerce', 'No invented reviews, no fake urgency, no countdown timers, and no claims about stock we do not hold.'],
              ].map(([t, d]) => (
                <li key={t} className="border-l-2 border-sand-500 pl-4">
                  <h3 className="font-display text-[17px] leading-snug">{t}</h3>
                  <p className="mt-1 text-[13.5px] text-ink-500">{d}</p>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="display-section mb-3">India first, carefully</h2>
            <p className="text-[14.5px] leading-relaxed text-ink-600">
              The store launches for India: INR pricing, PIN-code aware delivery, and payment methods chosen for the way
              people here actually pay. International expansion is designed for but deliberately switched off until a
              courier, duty treatment and a workable returns route exist for each destination — so we are never
              promising a delivery we cannot make.
            </p>
          </div>
        </div>
        <aside className="h-fit space-y-4 lg:pt-2">
          <div className="card p-6">
            <h2 className="eyebrow mb-3">Where this build stands</h2>
            <dl className="space-y-2.5 text-[13.5px]">
              {[
                ['Catalogue', `${String(counts.total)} records (${String(counts.sample)} labelled samples)`],
                ['Storefront', 'Complete: browse, search, filter, product pages, bag, checkout'],
                ['Payments', 'Provider not selected — sandbox only, live mode disabled'],
                ['Shipping', 'Courier not selected — no rates or dates published'],
                ['Cash on delivery', 'Disabled until approved'],
                ['Returns policy', 'Flow built; commercial terms pending'],
                ['Seller identity', s.legalEntityName ? 'Configured' : 'Pending owner review'],
              ].map(([k, v]) => (
                <div key={k as string} className="flex items-start justify-between gap-4 border-b border-stone-200 pb-2 last:border-0">
                  <dt className="text-ink-400">{k}</dt>
                  <dd className="text-right text-ink-700">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge tone="warn">Pre-launch</Badge>
              <Badge tone="sample">Sample catalogue</Badge>
            </div>
          </div>
          <div className="border border-dashed border-stone-300 bg-white/50 p-5 text-[13px] leading-relaxed text-ink-500">
            <ReviewBadge label="Business details pending" />
            <p className="mt-2">
              Registered entity name, GSTIN, support contacts and the return address have not been supplied to this
              build. They will be published once confirmed rather than filled in with placeholders.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 pt-1">
            <Link href="/shop" className="btn-solid">Shop the range</Link>
            <Link href="/contact" className="btn-outline">Contact us</Link>
          </div>
        </aside>
      </section>
    </>
  );
}
