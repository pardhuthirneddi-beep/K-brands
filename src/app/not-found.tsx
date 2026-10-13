import Link from 'next/link';
import { ensureDb } from '@/lib/bootstrap.ts';
import { listProducts } from '@/domain/catalog.ts';
import { ProductCard } from '@/components/product/product-card.tsx';

ensureDb();
export const dynamic = 'force-dynamic';

export default function NotFound() {
  const suggestions = listProducts({ perPage: 4, sort: 'featured' }).items;
  return (
    <div className="container py-16 lg:py-24">
      <div className="max-w-xl">
        <p className="eyebrow">Error 404</p>
        <h1 className="display-section mt-3">We cannot find that page</h1>
        <p className="mt-4 text-[14.5px] leading-relaxed text-ink-500">
          The link may be out of date, or the product may have been unpublished while you were browsing. Draft,
          archived and sample-hidden products deliberately return this page rather than showing incomplete data.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link href="/shop" className="btn-solid">
            Shop all
          </Link>
          <Link href="/search" className="btn-outline">
            Search the range
          </Link>
          <Link href="/contact" className="btn-quiet">
            Report a broken link
          </Link>
        </div>
      </div>
      {suggestions.length > 0 ? (
        <section className="mt-16">
          <h2 className="display-section mb-6 text-[24px]">Popular right now</h2>
          <div className="grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-4">
            {suggestions.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
