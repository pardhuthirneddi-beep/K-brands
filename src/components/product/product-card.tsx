'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import * as Dialog from '@radix-ui/react-dialog';
import { Price } from '../ui/price.tsx';
import { Badge, SampleBadge } from '../ui/badge.tsx';
import type { CatalogProduct } from '@/domain/catalog.ts';

/**
 * Product card — the unit that repeats across every listing, so it is defined once.
 *
 * Identical geometry in every grid (same 3:4 plate, same type scale, same meta row
 * height), swatches come from the product's own active variants, and an unavailable
 * image degrades to the colour-matched demo plate instead of a broken icon. Nothing is
 * asserted that the data cannot support: no star rating, no "12 people viewing", no
 * "only 1 left" unless the stock row actually says so.
 */
export function ProductCard({
  product,
  priority = false,
  compact = false,
}: {
  product: CatalogProduct;
  priority?: boolean;
  compact?: boolean;
}) {
  const [src, setSrc] = useState<string | null>(product.primaryImage ?? null);
  const [quick, setQuick] = useState(false);
  const fallback = `/media/sample/${product.slug}/0.svg?garment=${encodeURIComponent(product.garment_type ?? 'shirt')}`;
  const colors = product.colors ?? [];
  const isPhoto = (src ?? fallback).match(/\.(jpg|jpeg|png|webp)$/i) !== null;
  const shown = colors.slice(0, 4);
  const extra = colors.length - shown.length;

  return (
    <article className="group relative flex min-w-0 flex-col">
      <Link
        href={`/product/${product.slug}`}
        className="block overflow-hidden"
        aria-label={`${product.title}, ${product.availableUnits > 0 ? 'view product' : 'sold out'}`}
      >
        <div className="product-frame relative aspect-[3/4] w-full overflow-hidden">
          {isPhoto ? (
            <Image
              src={src ?? fallback}
              alt={`${product.title} — demo photograph of the ${product.color_family ?? 'men’s'} garment, not verified product photography`}
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 24vw"
              priority={priority}
              loading={priority ? 'eager' : 'lazy'}
              onError={() => setSrc(fallback)}
              className="h-full w-full object-cover transition-transform duration-700 ease-editorial group-hover:scale-[1.03]"
            />
          ) : (
            // Illustration plates are vector and carry a query string, so the optimiser is
            // skipped rather than pointed at a URL it cannot resize.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={src ?? fallback}
              alt={`${product.title} — demo illustration, not product photography`}
              width={900}
              height={1200}
              loading={priority ? 'eager' : 'lazy'}
              decoding="async"
              onError={() => setSrc(fallback)}
              className="h-full w-full object-cover transition-transform duration-700 ease-editorial group-hover:scale-[1.03]"
            />
          )}
          <div className="absolute left-2.5 top-2.5 flex flex-col items-start gap-1.5">
            {product.isSample ? <SampleBadge note={product.sample_note} label="Demo" /> : null}
            {product.savingsPercent ? <Badge tone="ink">−{product.savingsPercent}%</Badge> : null}
          </div>
          {product.availableUnits === 0 ? (
            <div className="absolute inset-x-0 bottom-0 bg-canvas/92 py-2 text-center text-[12px] text-ink-600">
              Sold out
            </div>
          ) : null}
        </div>
      </Link>

      <div className={`flex flex-1 flex-col ${compact ? 'gap-1 pt-3' : 'gap-1.5 pt-4'}`}>
        <p className="eyebrow truncate">{product.category_name ?? product.brand_line ?? 'Menswear'}</p>
        <h3 className="title-product leading-snug">
          <Link href={`/product/${product.slug}`} className="after:absolute after:inset-0 after:content-[''] hover:text-ink-500">
            {product.title}
          </Link>
        </h3>
        {product.subtitle && !compact ? (
          <p className="line-clamp-1 text-[12.5px] text-ink-600">{product.subtitle}</p>
        ) : null}

        {shown.length > 0 ? (
          <div
            className="mt-1.5 flex min-w-0 items-center gap-1.5"
            aria-label={`${String(colors.length)} ${colors.length === 1 ? 'colourway' : 'colourways'}, each photographed`}
          >
            {shown.map((c) => (
              <span
                key={c.name}
                title={c.name}
                className="h-3 w-3 rounded-full border border-line"
                style={{ backgroundColor: c.hex ?? '#EDE9E2' }}
              />
            ))}
            {extra > 0 ? <span className="text-[11.5px] text-ink-600">+{extra}</span> : null}
          </div>
        ) : null}

        <div className="mt-auto flex items-end justify-between gap-3 pt-2.5">
          <div>
            <Price cents={product.priceCents} compareAt={product.compare_at_price_cents} size="sm" />
            {product.availableUnits > 0 && product.availableUnits <= 4 ? (
              <p className="mt-0.5 text-[11.5px] text-ink-600">{product.availableUnits} left in stock (demo count)</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setQuick(true)}
            className="btn-quiet relative z-10 px-3 py-1.5 text-[12px] opacity-100 transition focus-visible:opacity-100 lg:opacity-0 lg:group-hover:opacity-100"
          >
            Quick view
          </button>
        </div>
      </div>

      <Dialog.Root open={quick} onOpenChange={setQuick}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-overlay bg-ink/40 backdrop-blur-[2px] data-[state=open]:animate-fade-in" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-drawer w-[min(680px,92vw)] -translate-x-1/2 -translate-y-1/2 border border-line bg-white data-[state=open]:animate-fade-in focus:outline-none">
            <div className="grid gap-0 sm:grid-cols-2">
              <div className="product-frame relative aspect-[3/4] overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src ?? fallback} alt={`${product.title} — demo visual`} className="h-full w-full object-cover" onError={() => setSrc(fallback)} />
              </div>
              <div className="flex flex-col p-5 sm:p-6">
                <Dialog.Title className="font-display text-[19px] leading-snug">{product.title}</Dialog.Title>
                <Dialog.Description className="mt-2 text-[13px] leading-relaxed text-ink-500">
                  {product.subtitle ?? product.description?.slice(0, 120) ?? 'Menswear by K-brands.'}
                </Dialog.Description>
                <div className="mt-4">
                  <Price cents={product.priceCents} compareAt={product.compare_at_price_cents} size="md" />
                </div>
                {colors.length > 0 ? (
                  <dl className="mt-4 space-y-1.5 text-[12.5px]">
                    <div className="flex gap-3">
                      <dt className="w-20 shrink-0 text-ink-600">Colours</dt>
                      <dd className="text-ink-600">{colors.map((c) => c.name).join(', ')}</dd>
                    </div>
                    <div className="flex gap-3">
                      <dt className="w-20 shrink-0 text-ink-600">Fabric</dt>
                      <dd className="text-ink-600">{product.fabric ?? 'To be confirmed'}</dd>
                    </div>
                    <div className="flex gap-3">
                      <dt className="w-20 shrink-0 text-ink-600">Availability</dt>
                      <dd className="text-ink-600">
                        {product.availableUnits > 0
                          ? `${product.availableUnits} units across ${product.variantCount} size/colour combinations`
                          : 'Currently sold out'}
                      </dd>
                    </div>
                  </dl>
                ) : null}
                <div className="mt-6 flex flex-wrap items-center gap-2.5 pt-1">
                  <Link href={`/product/${product.slug}`} className="btn-solid" onClick={() => setQuick(false)}>
                    View product
                  </Link>
                  <Link href={`/size-guide?fit=${encodeURIComponent(product.size_guide_key ?? 'standard-tops')}`} className="btn-outline" onClick={() => setQuick(false)}>
                    Size guide
                  </Link>
                  <Dialog.Close asChild>
                    <button type="button" className="btn-quiet">
                      Close
                    </button>
                  </Dialog.Close>
                </div>
                <p className="mt-4 text-[11.5px] leading-relaxed text-ink-600">
                  Demo record — imagery, price and stock are placeholders for development.
                </p>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </article>
  );
}
