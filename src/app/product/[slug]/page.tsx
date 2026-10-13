import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ensureDb } from '@/lib/bootstrap.ts';
import { getProductBySlug, listProducts } from '@/domain/catalog.ts';
import { Gallery } from '@/components/product/gallery.tsx';
import { ProductPurchase } from '@/components/product/product-purchase.tsx';
import { ProductCard } from '@/components/product/product-card.tsx';
import { SampleBadge } from '@/components/ui/badge.tsx';
import { formatMoney } from '@/domain/money.ts';
import { getSetting } from '@/domain/settings.ts';
import * as env from '@/lib/env.ts';

ensureDb();
export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const product = getProductBySlug(slug);
  // A withdrawn or mistyped URL still renders the not-found UI from the page below.
  // It is explicitly unindexable here, because with streaming enabled Next.js has
  // already sent the 200 by the time notFound() is raised — the status is the one
  // thing this layer cannot retro-actively change (see docs/deployment.md).
  if (!product) return { title: 'Product not found', robots: { index: false, follow: false } };
  const description =
    product.description?.slice(0, 155) ?? `${product.title} — ${formatMoney(product.priceCents, product.currency)}.`;
  return {
    title: product.title,
    description,
    alternates: { canonical: `/product/${product.slug}` },
    openGraph: {
      title: `${product.title} — K-brands`,
      description,
      type: 'website',
      images: product.images[0]?.url ? [{ url: product.images[0].url }] : undefined,
    },
  };
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const product = getProductBySlug(slug);
  if (!product) notFound();

  const taxMode = getSetting<string>('tax.mode', 'inclusive_unconfigured');
  const taxNote =
    taxMode === 'inclusive_configured'
      ? 'Price includes applicable taxes.'
      : taxMode === 'exclusive_configured'
        ? 'Applicable taxes are added at checkout.'
        : 'Tax treatment is not configured for this store yet — the price shown is what you would be quoted at checkout.';

  const variantOptions = product.variants
    .filter((v) => v.status === 'active')
    .map((v) => ({
      variantId: v.id,
      size: v.size,
      color: v.color_name,
      colorCode: v.color_code,
      priceCents: v.sellPriceCents,
      compareAtCents: v.compareAt,
      available: v.available,
      sku: v.sku,
    }));

  const related = listProducts({
    categorySlug: product.category_slug ?? undefined,
    perPage: 5,
    sort: 'newest',
  })
    .items.filter((p) => p.slug !== product.slug)
    .slice(0, 4);

  // Structured data only for verified (non-sample) products: a sample record must
  // never be described to a search engine as a real offer.
  const jsonLd = product.isSample
    ? null
    : {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: product.title,
        description: product.description ?? undefined,
        sku: product.variants[0]?.sku,
        brand: { '@type': 'Brand', name: 'K-brands' },
        image: product.images.map((i) => new URL(i.url, env.siteUrl).toString()),
        offers: {
          '@type': 'AggregateOffer',
          priceCurrency: product.currency,
          lowPrice: (product.priceCents / 100).toFixed(2),
          offerCount: variantOptions.filter((v) => v.available > 0).length,
          availability: product.soldOut ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock',
          url: new URL(`/product/${product.slug}`, env.siteUrl).toString(),
        },
      };

  return (
    <>
      {jsonLd ? (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      ) : null}
      <nav aria-label="Breadcrumb" className="border-b border-stone-200 bg-white/40">
        <ol className="container flex flex-wrap items-center gap-1.5 py-3 text-[12px] text-ink-400">
          {[
            { href: '/', label: 'Home' },
            { href: '/shop', label: 'Shop all' },
            ...(product.category_slug ? [{ href: `/collections/${product.category_slug}`, label: product.category_name ?? 'Collection' }] : []),
          ].map((c) => (
            <li key={c.href} className="flex items-center gap-1.5">
              <Link href={c.href} className="underline-offset-4 hover:text-ink hover:underline">
                {c.label}
              </Link>
              <span aria-hidden="true">/</span>
            </li>
          ))}
          <li aria-current="page" className="truncate text-ink-600">
            {product.title}
          </li>
        </ol>
      </nav>

      <article className="container grid gap-10 py-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:py-16">
        <Gallery images={product.images.map((i) => ({ url: i.url, alt: i.alt, kind: i.kind }))} title={product.title} />

        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <p className="eyebrow">{product.category_name ?? 'Menswear'}</p>
            {product.isSample ? <SampleBadge note={product.sample_note} /> : null}
            {product.status === 'out_of_stock' || product.soldOut ? (
              <span className="text-[12px] tracking-label text-alert-error">Sold out</span>
            ) : null}
          </div>
          <h1 className="mt-3 font-display text-[clamp(1.9rem,3.6vw,2.7rem)] leading-[1.05] tracking-tightest">
            {product.title}
          </h1>
          {product.subtitle ? <p className="mt-2 text-[15px] leading-relaxed text-ink-500">{product.subtitle}</p> : null}

          <ProductPurchase
            variants={variantOptions}
            sizes={product.sizes}
            colors={product.colors}
            soldOut={product.soldOut}
            isSample={product.isSample}
            sizeGuideKey={product.size_guide_key}
            productSlug={product.slug}
            currency={product.currency}
            taxNote={taxNote}
          />
        </div>
      </article>

      <section className="border-y border-stone-200 bg-white/50">
        <div className="container grid gap-10 py-12 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-6">
            <div>
              <h2 className="eyebrow mb-2.5">The piece</h2>
              <p className="max-w-prose text-[14.5px] leading-relaxed text-ink-600">
                {product.description ?? 'A description for this style has not been written yet.'}
              </p>
            </div>
            <div>
              <h2 className="eyebrow mb-2.5">Specification</h2>
              <dl className="max-w-xl divide-y divide-stone-200 border-y border-stone-200 text-[13.5px]">
                {[
                  ['Garment', product.garment_type],
                  ['Fit', product.fit],
                  ['Fabric', product.fabric],
                  ['Composition', product.fabric_composition],
                  ['Colour family', product.color_family],
                  ['Occasion', product.occasion],
                  ['Care', product.care],
                  ['Brand line', product.brand_line],
                ]
                  .filter(([, v]) => Boolean(v))
                  .map(([k, v]) => (
                    <div key={k as string} className="flex gap-4 py-2">
                      <dt className="w-36 shrink-0 text-ink-400">{k}</dt>
                      <dd className="text-ink-700">{v as string}</dd>
                    </div>
                  ))}
              </dl>
            </div>
          </div>
          <aside className="space-y-4">
            <div className="card p-5">
              <h2 className="eyebrow mb-2">Sizing</h2>
              <p className="text-[13.5px] leading-relaxed text-ink-500">
                This style is cut {product.fit ? `to a ${product.fit.toLowerCase()} fit` : 'true to size'}. All
                measurements are in centimetres and taken flat.
              </p>
              <Link href={`/size-guide?fit=${product.size_guide_key ?? 'standard-tops'}`} className="btn-outline mt-4 w-full">
                Open the size guide
              </Link>
            </div>
            <div className="card p-5">
              <h2 className="eyebrow mb-2">Delivery &amp; returns</h2>
              <p className="text-[13.5px] leading-relaxed text-ink-500">
                Delivery charges are quoted at checkout once the courier setup is approved. Returns and exchanges
                follow the published policy — until the owner approves it, no window is promised.
              </p>
              <div className="mt-3 flex gap-4 text-[12px]">
                <Link href="/policies/shipping" className="underline underline-offset-4">Shipping</Link>
                <Link href="/policies/returns" className="underline underline-offset-4">Returns</Link>
              </div>
            </div>
          </aside>
        </div>
      </section>

      {related.length > 0 ? (
        <section className="container py-14">
          <h2 className="display-section mb-7">Worn together</h2>
          <div className="grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-4">
            {related.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
