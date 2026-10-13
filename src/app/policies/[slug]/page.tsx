import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ensureDb } from '@/lib/bootstrap.ts';
import { POLICIES, renderPolicy } from '@/domain/policies.ts';
import { PolicyBody } from '@/components/site/policy-body.tsx';
import { ReviewBadge } from '@/components/ui/badge.tsx';

ensureDb();
// Policy text is configuration-driven, so the page must render per request — a return
// window the owner approves at 3am has to appear on the live page without a rebuild.
// generateStaticParams only exists to warm the six known slugs, and dynamicParams is
// closed so an invented slug is a hard 404 instead of a streamed 200 shell.
export const dynamic = 'force-dynamic';
export const dynamicParams = false;

type Props = { params: Promise<{ slug: string }> };

/** Only the six known policies exist; anything else is a 404 rather than a render. */
export function generateStaticParams() {
  return Object.keys(POLICIES).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const doc = POLICIES[slug];
  if (!doc) notFound();
  return {
    title: doc.title,
    description: doc.summary,
    alternates: { canonical: `/policies/${slug}` },
  };
}

export default async function PolicyPage({ params }: Props) {
  const { slug } = await params;
  const doc = POLICIES[slug];
  if (!doc) notFound();
  const rendered = renderPolicy(slug);
  return (
    <article className="container max-w-3xl py-12 lg:py-16">
      <nav aria-label="Breadcrumb" className="mb-6 text-[12px] text-ink-400">
        <Link href="/" className="underline-offset-4 hover:underline">Home</Link> / <span className="text-ink-600">{doc.title}</span>
      </nav>
      <header className="border-b border-stone-200 pb-6">
        <div className="flex flex-wrap items-center gap-3">
          <p className="eyebrow">Policy</p>
          {rendered.requiresReview ? <ReviewBadge label="Awaiting owner approval — not a published promise" /> : null}
        </div>
        <h1 className="display-section mt-3">{doc.title}</h1>
        <p className="mt-3 text-[14px] leading-relaxed text-ink-500">{doc.summary}</p>
      </header>
      <PolicyBody sections={rendered.sections} requiresReview={rendered.requiresReview} />
      <footer className="mt-10 border-t border-stone-200 pt-6 text-[12.5px] leading-relaxed text-ink-400">
        <p>
          Questions about this page? <Link href="/contact" className="text-ink underline underline-offset-4">Contact us</Link>.
          Other policies:{' '}
          {Object.entries(POLICIES)
            .filter(([k]) => k !== slug)
            .map(([k, v], i, arr) => (
              <span key={k}>
                <Link href={`/policies/${k}`} className="text-ink underline underline-offset-4">
                  {v.shortTitle}
                </Link>
                {i < arr.length - 1 ? ', ' : '.'}
              </span>
            ))}
        </p>
      </footer>
    </article>
  );
}
