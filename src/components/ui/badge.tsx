import clsx from 'clsx';

type Tone = 'neutral' | 'ink' | 'ok' | 'warn' | 'error' | 'sample' | 'outline';

const TONES: Record<Tone, string> = {
  neutral: 'bg-stone-100 text-ink-600 border-transparent',
  ink: 'bg-ink text-ivory-100 border-transparent',
  ok: 'bg-alert-ok/10 text-alert-ok border-alert-ok/25',
  warn: 'bg-alert-warn/12 text-alert-warn border-alert-warn/30',
  error: 'bg-alert-error/10 text-alert-error border-alert-error/25',
  sample: 'bg-sand-200 text-ink-700 border-sand-500/40 [border-style:dashed]',
  outline: 'bg-transparent text-ink-500 border-stone-300',
};

export function Badge({
  tone = 'neutral',
  children,
  className,
  title,
}: {
  tone?: Tone;
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={clsx(
        'inline-flex items-center gap-1 rounded-xs border px-2 py-0.5 text-[11.5px] font-medium tracking-label',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** The mark that keeps fictional catalogue records unmistakable in the admin UI. */
export function SampleBadge({
  note,
  className,
  label = 'Sample data',
}: {
  note?: string | null;
  className?: string;
  label?: string;
}) {
  return (
    <Badge tone="sample" className={className} title={note ?? 'Development sample — not real inventory'}>
      {label}
    </Badge>
  );
}

export function ReviewBadge({ label = 'Owner review required', className }: { label?: string; className?: string }) {
  return (
    <Badge tone="warn" className={className} title="This value has not been approved by the store owner.">
      {label}
    </Badge>
  );
}
