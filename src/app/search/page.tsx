import Link from 'next/link';
import { buildListing, ListingView } from '@/components/product/listing.tsx';
import { ensureDb } from '@/lib/bootstrap.ts';
import { EmptyState } from '@/components/ui/states.tsx';

ensureDb();
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Search',
  description: 'Search the K-brands menswear catalogue by style, fabric, colour or occasion.',
  robots: { index: false, follow: true },
};

export default async function SearchPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const raw = (await searchParams) as Record<string, string>;
  const q = (raw.q ?? '').trim().slice(0, 60);
  if (!q) {
    return (
      <section className="container py-16">
        <div className="max-w-xl">
          <h1 className="display-section">Search K-brands</h1>
          <p className="mt-3 text-[14.5px] leading-relaxed text-ink-500">
            Look for a garment, a fabric or an occasion — “oxford”, “linen”, “wedding” all work.
          </p>
          <form action="/search" method="get" className="mt-6 flex gap-2" role="search">
            <label htmlFor="q" className="sr-only">Search term</label>
            <input id="q" name="q" type="search" required minLength={2} maxLength={60} className="field" placeholder="e.g. merino, poplin, blazer" />
            <button type="submit" className="btn-solid">Search</button>
          </form>
          <div className="mt-8 flex flex-wrap gap-2">
            {['shirt', 'trouser', 'knitwear', 'blazer', 'white', 'office'].map((s) => (
              <Link key={s} href={`/search?q=${s}`} className="rounded-full border border-stone-300 px-3 py-1 text-[12.5px] transition hover:border-ink">
                {s}
              </Link>
            ))}
          </div>
        </div>
      </section>
    );
  }
  const { list, facets } = buildListing({ search: q, params: raw });
  if (list.total === 0) {
    return (
      <section className="container py-14">
        <h1 className="display-section mb-6">Results for “{q}”</h1>
        <EmptyState
          title={`We found nothing for “${q}”`}
          body="Check the spelling, try a shorter word, or browse the full range. The catalogue in this build is a small labelled sample set, so a thin result set is expected."
          action={{ href: '/shop', label: 'Browse everything' }}
        />
      </section>
    );
  }
  return (
    <>
      <div className="container pt-10">
        <p className="text-[12.5px] text-ink-600">
          <Link href="/search" className="underline-offset-4 hover:underline">Search</Link> / “{q}”
        </p>
      </div>
      <ListingView
        title={`Results for “${q}”`}
        list={list}
        facets={facets}
        baseHref="/search"
        params={{ ...raw, q }}
        sampleCount={list.sampleInView}
      />
    </>
  );
}
