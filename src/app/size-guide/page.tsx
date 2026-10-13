import type { Metadata } from 'next';
import { ensureDb } from '@/lib/bootstrap.ts';
import { SIZE_GUIDES } from '@/domain/size-guides.ts';

ensureDb();
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Size guide',
  description: 'How K-brands garments measure, and how to check a size against something you already own.',
  alternates: { canonical: '/size-guide' },
};

export default async function SizeGuidePage({ searchParams }: { searchParams: Promise<{ fit?: string }> }) {
  const { fit } = await searchParams;
  const key = fit && fit in SIZE_GUIDES ? fit : 'standard-tops';
  return (
    <div className="container max-w-4xl py-12 lg:py-16">
      <header className="border-b border-stone-200 pb-6">
        <p className="eyebrow">Fit &amp; measurement</p>
        <h1 className="display-section mt-3">Size guide</h1>
        <p className="mt-3 max-w-prose text-[14.5px] leading-relaxed text-ink-500">
          Measurements are garment dimensions taken flat, in centimetres, and are the figures we will use once real
          product data is loaded. Draft and sample products inherit these blocks so sizing behaviour can be tested
          now.
        </p>
      </header>
      <div className="mt-8 space-y-10">
        {Object.entries(SIZE_GUIDES).map(([k, guide]) => (
          <section key={k} id={k} className={k === key ? '' : ''}>
            <h2 className="display-section text-[23px]">{guide.title}</h2>
            <p className="mt-2 max-w-prose text-[13.5px] leading-relaxed text-ink-500">{guide.note}</p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-[13.5px]">
                <caption className="sr-only">{guide.title} measurement table, centimetres</caption>
                <thead>
                  <tr className="border-y border-stone-300 text-left">
                    {guide.columns.map((c) => (
                      <th key={c} scope="col" className="py-2 pr-4 font-medium text-ink-500">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {guide.rows.map((row) => (
                    <tr key={row[0]!} className="border-b border-stone-200">
                      {row.map((cell, i) => (
                        <td key={i} className={`py-2 pr-4 tabular-nums ${i === 0 ? 'font-medium' : ''}`}>
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {k === key ? (
              <p className="mt-3 border-l-2 border-sand-500 pl-3 text-[12.5px] leading-relaxed text-ink-500">
                {guide.howTo}
              </p>
            ) : null}
          </section>
        ))}
      </div>
    </div>
  );
}
