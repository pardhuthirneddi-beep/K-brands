import Link from 'next/link';
import { ensureDb } from '@/lib/bootstrap.ts';
import { listProducts } from '@/domain/catalog.ts';
import { ProductCard } from '@/components/product/product-card.tsx';
import { WordmarkLockup } from '@/components/site/wordmark.tsx';
import { Badge, ReviewBadge } from '@/components/ui/badge.tsx';
import { settingsForUi } from '@/domain/settings.ts';
import { runtimeBanner } from '@/lib/banner.ts';
import { formatMoney } from '@/domain/money.ts';

export const dynamic = 'force-dynamic';

ensureDb();

export default async function HomePage() {
  const featured = listProducts({ perPage: 8, sort: 'featured', categorySlug: null });
  const editorial = listProducts({ perPage: 4, sort: 'newest' });
  const s = settingsForUi();
  const banner = runtimeBanner();
  return (
    <>
      {/* HERO */}
      <section className="relative overflow-hidden border-b border-stone-200 bg-ivory-200/50">
        <div className="container grid gap-10 py-14 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:py-24">
          <div className="reveal max-w-2xl">
            <p className="eyebrow">Autumn / Winter · Sample catalogue</p>
            <h1 className="display-hero mt-4">
              Considered
              <br />
              menswear for
              <br />
              <em className="font-normal italic text-ink-500">the working week.</em>
            </h1>
            <p className="mt-6 max-w-md text-[15px] leading-relaxed text-ink-500">
              K-brands builds a restrained wardrobe: shirts that hold a collar, trousers that move, and knitwear fine
              enough for an air-conditioned office. {s.tagline ? `${s.tagline}.` : ''}
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/shop" className="btn-solid">
                Shop all
              </Link>
              <Link href="/collections/shirts" className="btn-outline">
                The shirt edit
              </Link>
            </div>
            <div className="mt-9 flex flex-wrap items-center gap-x-7 gap-y-2 text-[12px] text-ink-400">
              <span>India-first delivery</span>
              <span aria-hidden="true">·</span>
              <span>Prices in {s.currency}</span>
              <span aria-hidden="true">·</span>
              <span>Size guide for every style</span>
            </div>
          </div>
          <div className="relative">
            <div className="product-frame aspect-[4/5] w-full overflow-hidden border border-stone-200 lg:aspect-[4/4.4]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/media/sample/the-daily-oxford-shirt/0.svg"
                alt="Sample artwork: the Daily Oxford Shirt — illustration, not product photography"
                width={700}
                height={950}
                className="h-full w-full object-cover"
                fetchPriority="high"
              />
            </div>
            <div className="absolute -bottom-4 left-4 max-w-[240px] border border-stone-200 bg-white/95 px-4 py-3 shadow-card backdrop-blur">
              <p className="eyebrow">Featured sample</p>
              <p className="mt-1 font-display text-[16px] leading-snug">The Daily Oxford Shirt</p>
              <p className="mt-1 text-[13px] tabular-nums text-ink-600">{formatMoney(340000)}</p>
              <Link href="/product/the-daily-oxford-shirt" className="mt-2 inline-block text-[12px] tracking-label text-ink underline-offset-4 hover:underline">
                View product
              </Link>
            </div>
          </div>
        </div>
      </section>

      {banner ? (
        <section className="border-b border-stone-200 bg-sand-100/60">
          <div className="container flex flex-wrap items-center gap-3 py-3.5 text-[12.5px] leading-relaxed text-ink-600">
            <Badge tone="warn">Not live yet</Badge>
            <span>{banner}</span>
          </div>
        </section>
      ) : null}

      {/* VALUE STRIP */}
      <section className="border-b border-stone-200 bg-white/50">
        <div className="container grid gap-x-8 gap-y-6 py-8 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { t: 'Cut for the desk', d: 'Regular and tailored fits drafted around a commute, a meeting and a dinner after.' },
            { t: 'Fabric first', d: 'Composition and care are stated on every product page — no vague adjectives.' },
            { t: 'Sizing you can trust', d: 'Measured size guides per garment type, not a generic chart.' },
            { t: 'Built to be returned', d: 'Return and exchange rules will be published here once approved by the owner.' },
          ].map((item) => (
            <div key={item.t}>
              <h2 className="font-display text-[16px] leading-snug">{item.t}</h2>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink-500">{item.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FEATURED GRID */}
      <section className="container py-14 lg:py-20">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">The edit</p>
            <h2 className="display-section mt-2">Pieces that carry a week</h2>
          </div>
          <Link href="/shop" className="text-[12px] tracking-label text-ink-500 underline-offset-4 hover:text-ink hover:underline">
            View all {featured.total} styles
          </Link>
        </header>
        {featured.items.length === 0 ? (
          <div className="border border-dashed border-stone-300 bg-white/50 px-6 py-12">
            <h3 className="font-display text-[22px]">The catalogue is not loaded yet</h3>
            <p className="mt-2 max-w-prose text-[14px] leading-relaxed text-ink-500">
              Run <code className="rounded-xs bg-stone-100 px-1.5 py-0.5 text-[12px]">npm run db:seed-demo</code> to
              load clearly-labelled sample products, or add verified products in the admin dashboard.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3 lg:grid-cols-4">
            {featured.items.map((p, i) => (
              <ProductCard key={p.id} product={p} priority={i < 4} />
            ))}
          </div>
        )}
      </section>

      {/* EDITORIAL SPLIT */}
      <section className="border-y border-stone-200 bg-ink text-ivory-100">
        <div className="container grid gap-10 py-14 lg:grid-cols-2 lg:items-center lg:py-20">
          <div className="max-w-xl">
            <p className="eyebrow text-sand-300">Lookbook</p>
            <h2 className="display-section mt-3 text-ivory-100">
              A wardrobe of eight pieces, worn forty ways
            </h2>
            <p className="mt-5 text-[14.5px] leading-relaxed text-ivory-100/70">
              Our starting range is deliberately mixed: three shirting weights, two trouser blocks, a half-canvas
              blazer and knitwear fine enough to layer. Every record shown in this build is a labelled development
              sample — the photography, pricing and stock are placeholders until the owner publishes verified
              products.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/collections/wardrobe-essentials" className="btn bg-ivory-100 text-ink hover:bg-sand-200">
                Shop essentials
              </Link>
              <Link href="/size-guide" className="btn border border-ivory-100/35 text-ivory-100 hover:bg-ivory-100/10">
                Read the size guide
              </Link>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {editorial.items.slice(0, 4).map((p) => (
              <Link key={p.id} href={`/product/${p.slug}`} className="group block">
                <span className="product-frame block aspect-[4/5] overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.primaryImage ?? `/media/sample/${p.slug}/0.svg`}
                    alt={`${p.title} — sample artwork`}
                    width={600}
                    height={750}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                </span>
                <span className="mt-2 block text-[13px] text-ivory-100/85 group-hover:text-ivory-100">{p.title}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* TRUST / DISCLOSURE */}
      <section className="container py-14">
        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <h2 className="display-section">Before you order</h2>
            <p className="mt-4 max-w-prose text-[14px] leading-relaxed text-ink-500">
              This deployment is a working pre-launch build. It is intentionally transparent about what is and is not
              configured yet, so no customer mistakes it for a live store.
            </p>
            <ul className="mt-5 space-y-2 text-[13.5px] leading-relaxed text-ink-600">
              {[
                ['Payment gateway', 'not selected or connected — no live card, UPI or net-banking charge is possible'],
                ['Courier', 'provider undecided — delivery fees and dates are not quoted until configured'],
                ['Cash on delivery', 'disabled until the owner approves it and courier support is verified'],
                ['Returns & exchanges', 'policy pending owner approval; the workflow exists but publishes no promise'],
                ['Seller identity', 'legal entity, GSTIN and contact details pending — not invented here'],
              ].map(([k, v]) => (
                <li key={k} className="flex gap-3 border-b border-stone-200 pb-2">
                  <span className="w-40 shrink-0 text-[12px] tracking-label text-ink-400">{k}</span>
                  <span>{v}</span>
                </li>
              ))}
            </ul>
            <div className="mt-6">
              <ReviewBadge label="Owner sign-off outstanding — see the launch checklist" />
            </div>
          </div>
          <aside className="card p-6">
            <WordmarkLockup />
            <p className="mt-4 text-[13px] leading-relaxed text-ink-500">
              Questions about this build? The admin dashboard at <code className="text-[12px]">/admin</code> shows
              catalogue, inventory, orders and the configuration readiness report.
            </p>
            <div className="mt-5 flex flex-col gap-2 text-[13px]">
              <Link href="/contact" className="link-underline w-fit">
                Contact the team
              </Link>
              <Link href="/faq" className="link-underline w-fit">
                Frequently asked questions
              </Link>
              <Link href="/policies/privacy" className="link-underline w-fit">
                Privacy notice
              </Link>
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}
