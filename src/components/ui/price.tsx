import { formatMoney, formatMoneyParts } from '@/domain/money.ts';

export function Price({
  cents,
  compareAt,
  currency = 'INR',
  size = 'md',
  className = '',
}: {
  cents: number;
  compareAt?: number | null;
  currency?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const sizes = { sm: 'text-[13px]', md: 'text-[15px]', lg: 'text-[19px]' } as const;
  return (
    <span className={`tabular-nums ${sizes[size]} ${className}`}>
      <span className="font-medium">{formatMoney(cents, currency)}</span>
      {compareAt && compareAt > cents ? (
        <s className="ml-2 text-stone-400 line-through decoration-stone-400">{formatMoney(compareAt, currency)}</s>
      ) : null}
    </span>
  );
}

export function PriceSplit({ cents, currency = 'INR' }: { cents: number; currency?: string }) {
  const p = formatMoneyParts(cents, currency);
  return (
    <span className="inline-flex items-baseline tabular-nums">
      <span className="mr-0.5 text-[0.72em]">{p.symbol}</span>
      <span>{p.whole}</span>
      {p.fraction !== '00' ? <span className="text-[0.72em]">.{p.fraction}</span> : null}
    </span>
  );
}
