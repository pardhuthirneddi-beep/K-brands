export function PolicyBody({
  sections,
  requiresReview,
}: {
  sections: { heading: string; paragraphs: string[]; status: 'configured' | 'pending' }[];
  requiresReview: boolean;
}) {
  return (
    <div className="mt-8 space-y-8">
      {sections.map((s) => (
        <section key={s.heading}>
          <h2 className="flex flex-wrap items-baseline gap-3 font-display text-[21px] leading-snug">
            {s.heading}
            {s.status === 'pending' ? (
              <span className="rounded-xs border border-dashed border-alert-warn/50 bg-alert-warn/8 px-1.5 py-0.5 text-[11.5px] font-medium tracking-label text-alert-warn">
                To be confirmed
              </span>
            ) : null}
          </h2>
          <div className="mt-2.5 space-y-3">
            {s.paragraphs.map((p, i) => (
              <p key={i} className="max-w-prose text-[14.5px] leading-relaxed text-ink-600">
                {p}
              </p>
            ))}
          </div>
        </section>
      ))}
      {requiresReview ? (
        <aside className="border-l-2 border-sand-500 bg-sand-100/60 px-4 py-3 text-[13px] leading-relaxed text-ink-600">
          <strong className="font-semibold">Status of this page.</strong> Some details above are pending owner
          approval. Until they are set, the store does not publish them as commitments — and anything you see here
          marked “to be confirmed” should not be treated as a promise from K-brands.
        </aside>
      ) : null}
    </div>
  );
}
