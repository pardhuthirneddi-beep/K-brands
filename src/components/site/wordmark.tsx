/**
 * K-brands wordmark.
 *
 * The repository contained no logo file, so this is a type-based mark built from
 * the confirmed brand name — deliberately simple and easy for the owner to
 * replace with the supplied asset (docs/brand-assets.md).
 */
export function Wordmark({
  tone = 'ink',
  size = 'md',
  withLock = true,
}: {
  tone?: 'ink' | 'ivory';
  size?: 'sm' | 'md' | 'lg';
  withLock?: boolean;
}) {
  const color = tone === 'ivory' ? 'text-ivory-100' : 'text-ink';
  const scale = { sm: 'text-[15px]', md: 'text-[19px]', lg: 'text-[26px]' }[size];
  return (
    <span className={`inline-flex items-baseline gap-[0.08em] font-display leading-none ${scale} ${color}`}>
      {withLock ? (
        <span
          aria-hidden="true"
          className={`mr-[0.16em] inline-grid h-[0.95em] w-[0.95em] translate-y-[0.06em] place-items-center rounded-[2px] text-[0.62em] font-semibold ${
            tone === 'ivory' ? 'bg-ivory-100 text-ink' : 'bg-ink text-ivory-100'
          }`}
        >
          K
        </span>
      ) : null}
      <span className="tracking-[-0.01em]">K-brands</span>
    </span>
  );
}

export function WordmarkLockup({ subtitle = true }: { subtitle?: boolean }) {
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Wordmark size="lg" />
      {subtitle ? (
        <span className="text-[11.5px] tracking-label text-ink-400">Considered menswear</span>
      ) : null}
    </span>
  );
}
