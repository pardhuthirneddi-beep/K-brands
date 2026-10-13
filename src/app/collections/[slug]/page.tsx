import { notFound } from 'next/navigation';
import { buildListing, ListingView } from '@/components/product/listing.tsx';
import { collectionPage, listCategories } from '@/domain/catalog.ts';
import { ensureDb } from '@/lib/bootstrap.ts';
import type { Metadata } from 'next';

ensureDb();
export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | undefined>> };

export async function generateStaticParams() {
  return listCategories().map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const c = collectionPage(slug);
  if (!c) return { title: 'Collection not found', robots: { index: false, follow: false } };
  return {
    title: c.meta_title ?? `${c.name} — K-brands`,
    description: c.meta_description ?? c.description ?? `${c.name} at K-brands.`,
    alternates: { canonical: `/collections/${slug}` },
  };
}

export default async function CollectionPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const collection = collectionPage(slug);
  if (!collection) notFound();
  const raw = (await searchParams) as Record<string, string>;
  const { list, facets } = buildListing({ categorySlug: slug, params: raw });
  return (
    <ListingView
      title={collection.name}
      intro={collection.description ?? undefined}
      list={list}
      facets={facets}
      baseHref={`/collections/${slug}`}
      params={raw}
      sampleCount={list.sampleInView}
    />
  );
}
