/*
 * K-brands wordmark.
 *
 * The owner supplied a reference badge - a gold K with an eagle cut through it, on a dark meshed
 * disc - so the type-based stand-in that this file used to draw is gone. The artwork is served from
 * /public/brand, not redrawn here, for one reason: a logo must not be recoloured to match a
 * component's mood. `tone` therefore changes only the *text* beside it. The disc reads on the light
 * canvas and on ink alike, which is why one asset covers both.
 *
 * `mark.svg` carries the mesh and the feather cuts; `mark-tiny.svg` drops them, because at favicon
 * size detail is what turns a mark into a smudge.
 */
const MARK = '/brand/mark.svg';
const MARK_TINY = '/brand/mark-tiny.svg';

const BOX = { sm: 'h-[22px] w-[22px]', md: 'h-[28px] w-[28px]', lg: 'h-[44px] w-[44px]' } as const;
const TYPE = { sm: 'text-[15px]', md: 'text-[19px]', lg: 'text-[26px]' } as const;

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
  // Next/image is deliberately not used here: SVG needs dangerouslyAllowSVG to be optimised, and an
  // inline-cached 2 KB vector gains nothing from a resize pipeline.
  return (
    <span className={`inline-flex items-center gap-[0.4em] leading-none ${TYPE[size]} ${color}`}>
      {withLock ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={size === 'sm' ? MARK_TINY : MARK}
          alt=""
          aria-hidden="true"
          className={`${BOX[size]} shrink-0 rounded-full`}
          width={44}
          height={44}
          draggable={false}
        />
      ) : null}
      <span className="font-display tracking-[-0.01em]">K-brands</span>
    </span>
  );
}

export function WordmarkLockup({ subtitle = true }: { subtitle?: boolean }) {
  return (
    <span className="inline-flex flex-col items-start gap-2.5">
      <Wordmark size="lg" />
      {subtitle ? (
        <span className="text-[11.5px] tracking-label text-ink-600">Considered menswear</span>
      ) : null}
    </span>
  );
}
