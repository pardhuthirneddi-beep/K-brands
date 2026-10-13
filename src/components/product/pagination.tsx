import Link from 'next/link';

export function Pagination({ page, pages, hrefFor }: { page: number; pages: number; hrefFor: (p: number) => string }) {
  if (pages <= 1) return null;
  const window: number[] = [];
  for (let p = Math.max(1, page - 2); p <= Math.min(pages, page + 2); p += 1) window.push(p);
  return (
    <nav aria-label="Pagination" className="mt-12 flex items-center justify-center gap-1.5">
      {page > 1 ? (
        <Link href={hrefFor(page - 1)} className="btn-quiet px-3 py-1.5 text-[11.5px]">
          Previous
        </Link>
      ) : null}
      {window[0]! > 1 ? <span className="px-1 text-stone-400">…</span> : null}
      {window.map((p) => (
        <Link
          key={p}
          href={hrefFor(p)}
          aria-current={p === page ? 'page' : undefined}
          className={`h-8 min-w-8 rounded-xs px-2 text-[12.5px] tabular-nums transition ${
            p === page ? 'bg-ink text-ivory-100' : 'border border-stone-300 bg-white hover:border-ink-300'
          }`}
        >
          {p}
        </Link>
      ))}
      {window[window.length - 1]! < pages ? <span className="px-1 text-stone-400">…</span> : null}
      {page < pages ? (
        <Link href={hrefFor(page + 1)} className="btn-quiet px-3 py-1.5 text-[11.5px]">
          Next
        </Link>
      ) : null}
    </nav>
  );
}
