import Link from 'next/link';
import { Price } from '../ui/price.tsx';
import { Badge, SampleBadge } from '../ui/badge.tsx';
import type { CatalogProduct } from '@/domain/catalog.ts';

export function ProductCard({
  product,
  priority = false,
  compact = false,
}: {
  product: CatalogProduct;
  priority?: boolean;
  compact?: boolean;
}) {
  const url = product.primaryImage ?? `/media/sample/${product.slug}/0.svg`;
  return (
    <article className="group relative flex flex-col">
      <Link href={`/product/${product.slug}`} className="block overflow-hidden" aria-label={`${product.title}, from ${product.priceCents / 100}`}>
        <div className="product-frame relative aspect-[3/4] w-full overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={`${product.title} — sample artwork (not product photography)`}
            width={900}
            height={1200}
            loading={priority ? 'eager' : 'lazy'}
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-700 ease-editorial group-hover:scale-[1.035]"
          />
          <div className="absolute left-2.5 top-2.5 flex flex-col items-start gap-1.5">
            {product.isSample ? <SampleBadge /> : null}
            {product.savingsPercent ? <Badge tone="ink">−{product.savingsPercent}%</Badge> : null}
          </div>
        </div>
      </Link>
      <div className={`flex flex-1 flex-col ${compact ? 'gap-0.5 pt-2.5' : 'gap-1 pt-3.5'}`}>
        <p className="eyebrow truncate">{product.category_name ?? product.brand_line ?? 'Menswear'}</p>
        <h3 className="font-display text-[17px] leading-snug">
          <Link href={`/product/${product.slug}`} className="after:absolute after:inset-0 after:content-[''] hover:text-ink-500">
            {product.title}
          </Link>
          {product.availableUnits === 0 ? (
            <span className="mt-1 inline-block text-[12px] tracking-label text-alert-error">Sold out</span>
          ) : null}
        </h3>
        {product.subtitle && !compact ? <p className="line-clamp-1 text-[12.5px] text-ink-400">{product.subtitle}</p> : null}
        <div className="mt-auto pt-1.5">
          <Price cents={product.priceCents} compareAt={product.compare_at_price_cents} size="sm" />
        </div>
      </div>
    </article>
  );
}
