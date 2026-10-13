'use client';

export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = 10,
  disabled = false,
  label = 'Quantity',
  size = 'md',
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
  label?: string;
  size?: 'sm' | 'md';
}) {
  const dim = size === 'sm' ? 'h-10 w-10' : 'h-11 w-11';
  return (
    <div className="inline-flex items-center border border-stone-300 bg-white">
      <button
        type="button"
        aria-label={`Decrease ${label.toLowerCase()}`}
        disabled={disabled || value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
        className={`${dim} grid place-items-center text-[15px] text-ink transition hover:bg-stone-100 disabled:opacity-35`}
      >
        <span aria-hidden="true">−</span>
      </button>
      <input
        aria-label={label}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value.replace(/\D/g, ''));
          onChange(Number.isFinite(n) && n > 0 ? Math.min(max, n) : min);
        }}
        inputMode="numeric"
        disabled={disabled}
        className={`${size === 'sm' ? 'w-8' : 'w-10'} border-x border-stone-300 bg-transparent py-1.5 text-center text-[13px] tabular-nums outline-none`}
      />
      <button
        type="button"
        aria-label={`Increase ${label.toLowerCase()}`}
        disabled={disabled || value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
        className={`${dim} grid place-items-center text-[15px] text-ink transition hover:bg-stone-100 disabled:opacity-35`}
      >
        <span aria-hidden="true">+</span>
      </button>
    </div>
  );
}
