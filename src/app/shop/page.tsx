import { buildListing, ListingView, listingMetadata } from '@/components/product/listing.tsx';
import { productCount } from '@/domain/catalog.ts';

export const dynamic = 'force-dynamic';

export const metadata = listingMetadata(
  'Shop all menswear',
  'Shirts, trousers, knitwear, blazers and wardrobe essentials from K-brands. Currently a labelled sample catalogue for pre-launch testing.',
  '/shop',
);

export default async function ShopPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const raw = (await searchParams) as Record<string, string>;
  const { list, facets } = buildListing({ params: raw });
  const counts = productCount();
  return (
    <ListingView
      title="Shop all"
      intro={`The complete K-brands range for the working week. ${counts.sample} of the ${counts.total} catalogue records are labelled development samples.`}
      list={list}
      facets={facets}
      baseHref="/shop"
      params={raw}
      sampleCount={counts.sample}
    />
  );
}
