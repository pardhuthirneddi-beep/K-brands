export function Spinner({ label = 'Loading', className = '' }: { label?: string; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 text-[12px] tracking-label text-ink-400 ${className}`}>
      <span
        className="inline-block h-3.5 w-3.5 animate-spin rounded-full border border-ink/25 border-t-ink"
        aria-hidden="true"
      />
      <span>{label}</span>
    </span>
  );
}
