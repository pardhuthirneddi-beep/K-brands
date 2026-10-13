import type { Metadata } from 'next';
import { ensureDb } from '@/lib/bootstrap.ts';
import { facetCounts, listProducts, type SortKey } from '@/domain/catalog.ts';
import { FilterBar } from './filter-bar.tsx';
import { ShopGrid } from './shop-grid.tsx';
import { Pagination } from './pagination.tsx';
import { Badge, SampleBadge } from '../ui/badge.tsx';
import * as env from '@/lib/env.ts';

ensureDb();

export type ListingSearch = {
  q?: string;
  /** product_tags filter, e.g. 'new' for New Arrivals or 'featured'. */
  tag?: string;
  sizes?: string;
  colors?: string;
  garments?: string;
  max?: string;
  instock?: string;
  sort?: string;
  page?: string;
};

const SORTS = ['featured', 'newest', 'price_asc', 'price_desc', 'name_asc', 'discount'] as const;

export function buildListing(opts: { categorySlug?: string | null; search?: string | null; params: ListingSearch }) {
  const p = opts.params;
  const sort = (SORTS as readonly string[]).includes(p.sort ?? '') ? (p.sort as SortKey) : 'featured';
  const list = listProducts({
    categorySlug: opts.categorySlug ?? null,
    search: opts.search ?? p.q ?? null,
    sort,
    page: Math.max(1, Number(p.page ?? 1) || 1),
    perPage: 16,
    sizes: p.sizes?.split(',').filter(Boolean),
    colors: p.colors?.split(',').filter(Boolean),
    garmentTypes: p.garments?.split(',').filter(Boolean),
    maxPriceCents: p.max ? Math.max(0, Number(p.max) || 0) : null,
    onlyInStock: p.instock === '1',
    tag: p.tag ?? null,
    includeSamples: env.demoCatalogueEnabled,
  });
  const facets = facetCounts({ categorySlug: opts.categorySlug ?? null, includeSamples: env.demoCatalogueEnabled });
  return { list, facets, sort };
}

export function ListingView({
  title,
  intro,
  list,
  facets,
  baseHref,
  params,
  sampleCount,
}: {
  title: string;
  intro?: string;
  list: ReturnType<typeof listProducts>;
  facets: ReturnType<typeof facetCounts>;
  baseHref: string;
  params: ListingSearch;
  sampleCount: number;
}) {
  const hrefFor = (page: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v && k !== 'page') q.set(k, v);
    if (page > 1) q.set('page', String(page));
    const qs = q.toString();
    return `${baseHref}${qs ? `?${qs}` : ''}`;
  };
  return (
    <section className="container py-10 lg:py-14">
      <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="display-section">{title}</h1>
          {intro ? <p className="mt-3 text-[14.5px] leading-relaxed text-ink-500">{intro}</p> : null}
        </div>
        <p className="text-[12.5px] text-ink-400" aria-live="polite">
          {list.total} {list.total === 1 ? 'style' : 'styles'}
        </p>
      </header>
      {sampleCount > 0 ? (
        <div className="mb-6 flex flex-wrap items-center gap-2.5 border border-sand-500/35 bg-sand-100/60 px-4 py-2.5">
          <SampleBadge />
          <p className="text-[12.5px] leading-relaxed text-ink-600">
            {list.sampleInView} of these {list.total} {list.total === 1 ? 'record is' : 'records are'} development
            samples — fictional pricing and stock, used to build and test the storefront.
          </p>
          <Badge tone="outline">Not real inventory</Badge>
        </div>
      ) : null}
      <FilterBar facets={facets} baseHref={baseHref} />
      <div className="mt-8">
        <ShopGrid items={list.items} />
      </div>
      <Pagination page={list.page} pages={list.pages} hrefFor={hrefFor} />
    </section>
  );
}

export function listingMetadata(title: string, description: string, path: string): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { title, description, url: path },
  };
}
