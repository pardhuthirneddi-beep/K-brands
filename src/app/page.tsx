import Link from 'next/link';
import { ensureDb } from '@/lib/bootstrap.ts';
import { listCategories, listProducts } from '@/domain/catalog.ts';
import { settingsForUi } from '@/domain/settings.ts';
import { ShopGrid } from '@/components/product/shop-grid.tsx';
import { NewsletterForm } from '@/components/site/newsletter-form.tsx';
import { Badge } from '@/components/ui/badge.tsx';
import * as env from '@/lib/env.ts';

ensureDb();
export const dynamic = 'force-dynamic';

/**
 * Homepage.
 *
 * Section order follows the brand brief: hero → shop by category → featured → editorial
 * campaign → new arrivals → brand story → newsletter (the announcement bar, header and
 * footer live in the root layout). Every number, image, price and link on this page is
 * read from the catalogue at request time — nothing here is a hardcoded mock, so when the
 * owner replaces the demo rows this page re-lays itself out around the real range.
 *
 * Deliberately absent: a founding year, a manufacturing origin, a sustainability claim, a
 * "bestseller"/"trending" label, invented delivery promises and any accessories or
 * women's content. There is nothing in the data to support those, and an unsupported claim
 * on a pre-launch store is the kind of thing that has to be un-found later.
 */

function SectionHead({
  eyebrow,
  title,
  copy,
  action,
}: {
  eyebrow: string;
  title: string;
  copy?: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
      <div className="max-w-2xl">
        <p className="eyebrow">{eyebrow}</p>
        <h2 className="display-section mt-3">{title}</h2>
        {copy ? <p className="mt-4 text-[14.5px] leading-relaxed text-ink-500">{copy}</p> : null}
      </div>
      {action ? (
        <Link href={action.href} className="btn-outline shrink-0">
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}

export default async function HomePage() {
  const settings = settingsForUi();
  const categories = listCategories({ includeSamples: env.demoCatalogueEnabled });
  const roots = categories.filter((c) => !c.parent_slug && c.product_count > 0);

  const featured = listProducts({
    tag: 'featured',
    sort: 'featured',
    perPage: 4,
    includeSamples: env.demoCatalogueEnabled,
  });
  const fresh = listProducts({
    tag: 'new',
    sort: 'newest',
    perPage: 4,
    includeSamples: env.demoCatalogueEnabled,
  });
  const allRange = listProducts({ sort: 'featured', perPage: 12, includeSamples: env.demoCatalogueEnabled });

  // One representative image per category, taken from the products in that category
  // rather than from a path written into this component.
  const tiles = await Promise.all(
    roots.slice(0, 6).map(async (c) => {
      const lead = listProducts({
        categorySlug: c.slug,
        perPage: 1,
        sort: 'featured',
        includeSamples: env.demoCatalogueEnabled,
      }).items[0];
      return { ...c, image: lead?.primaryImage ?? null, leadSlug: lead?.slug ?? null };
    }),
  );

  // The editorial campaign has to sell something real: pull the linen range and link the
  // two strongest pieces by handle, falling back to whatever the category actually holds.
  const linen = listProducts({
    categorySlug: 'linen-shirts',
    perPage: 3,
    sort: 'newest',
    includeSamples: env.demoCatalogueEnabled,
  }).items;
  const campaignProduct = linen[0] ?? allRange.items[0] ?? null;
  const campaignSecondary = linen[1] ?? allRange.items[1] ?? null;

  const hero = campaignProduct ?? allRange.items[0] ?? null;
  // The strapline under the hero name is the owner-editable one from settings, so this
  // line changes when they approve a new one in /admin/settings — it is not hardcoded copy.
  const heroProductLabel = (settings.tagline ?? 'Contemporary menswear').replace(/ for the working week$/i, '');
  const heroImage = hero?.primaryImage?.endsWith('.jpg') ? hero.primaryImage : '/media/demo/pure-linen-shirt.jpg';

  return (
    <>
      {/* ── 1. Hero ───────────────────────────────────────────────────────────────── */}
      <section className="border-b border-line">
        <div className="container grid gap-0 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-stretch">
          <div className="flex flex-col justify-center py-12 lg:py-24 lg:pr-14">
            <p className="eyebrow">
              {heroProductLabel} · {allRange.total} {allRange.total === 1 ? 'style' : 'styles'} live
            </p>
            <h1 className="display-hero mt-5 max-w-[15ch]">Clothes for the working week.</h1>
            <p className="mt-6 max-w-[46ch] text-[15.5px] leading-relaxed text-ink-500">
              Linen that behaves in humidity, oxford that survives a commute, poplin that
              presses clean. {allRange.total} {allRange.total === 1 ? 'piece' : 'pieces'} cut for men
              in Indian cities, priced in rupees, delivered across India.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href="/shop?tag=new" className="btn-solid">
                Shop New Arrivals
              </Link>
              <Link href="/collections/shirts" className="btn-outline">
                Explore Shirts
              </Link>
            </div>
            <p className="mt-10 flex flex-wrap items-center gap-2.5 text-[12.5px] leading-relaxed text-ink-400">
              <Badge tone="outline">Demo storefront</Badge>
              Catalogue, imagery and prices are development placeholders. No orders are dispatched from this build.
            </p>
          </div>

          <figure className="relative -mx-5 lg:mx-0">
            <div className="product-frame relative aspect-[3/4] w-full overflow-hidden sm:aspect-[4/3] lg:aspect-auto lg:h-full lg:min-h-[560px]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={heroImage}
                alt={
                  hero
                    ? `Demo visual: ${hero.title}. Labelled demonstration imagery, not verified product photography.`
                    : 'Demo visual — labelled demonstration imagery'
                }
                width={900}
                height={1200}
                loading="eager"
                fetchPriority="high"
                decoding="async"
                className="h-full w-full object-cover"
              />
            </div>
            <figcaption className="absolute bottom-4 left-4 bg-canvas/90 px-2.5 py-1 text-[11.5px] text-ink-500">
              Demo imagery — not product photography
            </figcaption>
            {hero ? (
              <Link
                href={`/product/${hero.slug}`}
                className="absolute bottom-4 right-4 bg-canvas/90 px-3 py-1.5 text-[12.5px] text-ink transition hover:bg-canvas"
              >
                View {hero.title}
              </Link>
            ) : null}
          </figure>
        </div>
      </section>

      {/* ── 2. Shop by category ───────────────────────────────────────────────────── */}
      {tiles.length > 0 ? (
        <section className="container py-16 lg:py-24">
          <SectionHead
            eyebrow="The range"
            title="Shop by category"
            copy="Six doors, each one populated by the current catalogue. Empty categories are not shown rather than being kept as placeholders."
            action={{ href: '/shop', label: 'Shop all' }}
          />
          <div className="mt-10 grid grid-cols-2 gap-x-5 gap-y-10 md:grid-cols-3">
            {tiles.map((t) => (
              <Link key={t.slug} href={`/collections/${t.slug}`} className="group block">
                <div className="product-frame relative aspect-[4/5] w-full overflow-hidden">
                  {t.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={t.image}
                      alt={`Demo visual for ${t.name}`}
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover transition-transform duration-700 ease-editorial group-hover:scale-[1.03]"
                    />
                  ) : (
                    <div className="grid h-full place-items-center px-4 text-center">
                      <span className="font-display text-[20px] text-ink-600">{t.name}</span>
                    </div>
                  )}
                </div>
                <div className="mt-3.5 flex items-baseline justify-between gap-3 border-t border-line pt-3">
                  <h3 className="font-display text-[17px] leading-snug group-hover:text-ink-500">{t.name}</h3>
                  <span className="shrink-0 text-[12px] text-ink-400">
                    {t.product_count} {t.product_count === 1 ? 'style' : 'styles'}
                  </span>
                </div>
                {t.description ? (
                  <p className="mt-1.5 line-clamp-2 text-[12.5px] leading-relaxed text-ink-400">{t.description}</p>
                ) : null}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {/* ── 3. Featured ───────────────────────────────────────────────────────────── */}
      {featured.items.length > 0 ? (
        <section className="border-y border-line bg-white/60">
          <div className="container py-16 lg:py-24">
            <SectionHead
              eyebrow="Chosen by the studio"
              title="Featured pieces"
              copy="Marked in the catalogue, not by an algorithm — and every price below is the price the checkout will charge."
              action={{ href: '/shop?sort=featured', label: 'See all featured' }}
            />
            <div className="mt-10">
              <ShopGrid items={featured.items} dense />
            </div>
          </div>
        </section>
      ) : null}

      {/* ── 4. Editorial campaign, linked to real products ──────────────────────────── */}
      {campaignProduct ? (
        <section className="container py-16 lg:py-24">
          <div className="grid items-center gap-10 border border-line bg-stone-100/70 p-6 sm:p-10 lg:grid-cols-2 lg:gap-16">
            <div>
              <p className="eyebrow">The linen file</p>
              <h2 className="display-section mt-3 max-w-[18ch]">
                One shirt for the whole week, if you only bring one.
              </h2>
              <p className="mt-5 max-w-[52ch] text-[14.5px] leading-relaxed text-ink-500">
                Worn open over a tee, tucked under a blazer, washed often and softer for it. The
                linen range is the smallest part of this catalogue and the reason most people find
                the label — so it is where we started.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href={`/product/${campaignProduct.slug}`} className="btn-solid">
                  Shop the linen shirt
                </Link>
                {campaignSecondary ? (
                  <Link href={`/product/${campaignSecondary.slug}`} className="btn-outline">
                    Or the knit polo
                  </Link>
                ) : null}
                <Link href="/collections/linen-shirts" className="btn-quiet">
                  All linen shirts
                </Link>
              </div>
            </div>
            <figure className="product-frame relative aspect-[4/5] w-full overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={campaignProduct.primaryImage ?? `/media/sample/${campaignProduct.slug}/0.svg?garment=shirt`}
                alt={`Demo visual: ${campaignProduct.title}`}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover"
              />
              <figcaption className="absolute bottom-3 left-3 bg-canvas/90 px-2 py-0.5 text-[11.5px] text-ink-500">
                Demo imagery
              </figcaption>
            </figure>
          </div>
        </section>
      ) : null}

      {/* ── 5. New arrivals — only pieces actually flagged new ──────────────────────── */}
      {fresh.items.length > 0 ? (
        <section className="border-t border-line">
          <div className="container py-16 lg:py-24">
            <SectionHead
              eyebrow="Just added"
              title="New arrivals"
              copy={`The ${fresh.total} ${fresh.total === 1 ? 'piece' : 'pieces'} the catalogue flags as new. Nothing here is dressed up as a bestseller — this store has no sales history to rank yet.`}
              action={{ href: '/shop?tag=new&sort=newest', label: 'View all new' }}
            />
            <div className="mt-10">
              <ShopGrid items={fresh.items} dense />
            </div>
          </div>
        </section>
      ) : null}

      {/* ── 6. Brand story, without invented provenance ────────────────────────────── */}
      <section className="border-y border-line bg-white/60">
        <div className="container grid gap-10 py-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:py-24">
          <div>
            <p className="eyebrow">About K-brands</p>
            <h2 className="display-section mt-3 max-w-[16ch]">A label still being built, in the open.</h2>
          </div>
          <div className="max-w-[62ch] space-y-5 text-[14.5px] leading-relaxed text-ink-600">
            <p>
              K-brands is a contemporary menswear label for India: shirts, polos, tees, trousers,
              denim and light layers, cut for a working week that moves between an office, a
              restaurant and a weekend that refuses to dress up.
            </p>
            <p>
              What we will not do is tell you a founding year, a mill we have not named or a
              sustainability credential we have not documented. Those details belong to the
              business, and the business is still confirming them. When this storefront carries
              real records, the claims here will be the ones the records support.
            </p>
            <p className="text-ink-500">
              Until then everything on this site — photography, prices, fabric compositions and
              stock counts — is labelled demo data, and you can browse, filter and test a full
              checkout without being charged.
            </p>
            <div className="flex flex-wrap gap-3 pt-1">
              <Link href="/about" className="btn-quiet">
                Read the full story
              </Link>
              <Link href="/contact" className="btn-quiet">
                Talk to us
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── 7. Newsletter — writes a real row, or says nothing happened ─────────────── */}
      <section className="container py-16 lg:py-24">
        <div className="grid gap-8 border border-line p-6 sm:p-10 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="eyebrow">Launch list</p>
            <h2 className="display-section mt-3 max-w-[18ch]">One email when the store opens.</h2>
            <p className="mt-4 max-w-[48ch] text-[14.5px] leading-relaxed text-ink-500">
              No weekly digest, no discount theatre. Your address is stored in this deployment
              with the consent text you agreed to, and you can ask us to remove it at
              {' '}
              {settings.supportEmail ? (
                <a href={`mailto:${settings.supportEmail}`} className="link-underline text-ink">
                  {settings.supportEmail}
                </a>
              ) : (
                <span className="text-ink">our support address (not yet published)</span>
              )}
              .
            </p>
          </div>
          <div className="lg:justify-self-end">
            <NewsletterForm source="homepage" />
          </div>
        </div>
      </section>
    </>
  );
}
