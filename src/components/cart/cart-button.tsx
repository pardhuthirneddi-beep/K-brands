'use client';

import { useCart } from '../providers.tsx';

export function CartButton({ initialCount }: { initialCount: number }) {
  const { drawerOpen, openDrawer, count } = useCart();
  const value = count || initialCount;
  return (
    <button
      type="button"
      onClick={openDrawer}
      aria-label={`Open bag, ${String(value)} item${value === 1 ? '' : 's'}`}
      aria-expanded={drawerOpen}
      className="relative inline-flex h-9 items-center gap-2 rounded-xs px-2 text-[12px] tracking-label text-ink-600 transition hover:bg-white hover:text-ink"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.15">
        <path d="M3.2 5h9.6l-.8 8.2H4L3.2 5Z" />
        <path d="M6 6.6V4a2 2 0 0 1 4 0v2.6" strokeLinecap="round" />
      </svg>
      <span className="hidden sm:inline">Bag</span>
      <span
        aria-hidden="true"
        className={`grid h-4 min-w-4 place-items-center rounded-full px-1 text-[11.5px] tabular-nums transition ${
          value > 0 ? 'bg-ink text-ivory-100' : 'bg-stone-200 text-ink-400'
        }`}
      >
        {value > 0 ? value : '0'}
      </span>
      <span className="sr-only">{`${String(value)} item${value === 1 ? '' : 's'} in your bag`}</span>
    </button>
  );
}
