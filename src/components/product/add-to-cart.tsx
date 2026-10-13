'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, emitCart, useCart } from '../providers.tsx';
import { Spinner } from '../ui/spinner.tsx';

export function AddToCart({
  variantId,
  available,
  soldOut,
  isSample,
}: {
  variantId: number | null;
  available: number;
  soldOut: boolean;
  isSample: boolean;
}) {
  const [quantity, setQuantity] = useState(1);
  const [state, setState] = useState<'idle' | 'saving' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState(false);
  const { toast, openDrawer } = useCart();
  const router = useRouter();

  const disabled = soldOut || variantId == null || state === 'saving';

  async function submit() {
    if (variantId == null) return;
    setState('saving');
    setError(null);
    try {
      const res = await apiFetch<{ itemCount: number; message?: string | null }>('/api/cart', {
        method: 'POST',
        body: { variantId, quantity },
      });
      emitCart({ count: res.itemCount, route: true });
      toast(res.message ?? 'Added to your bag.', 'ok');
      setAdded(true);
      openDrawer();
      router.refresh();
      window.setTimeout(() => setAdded(false), 2500);
    } catch (err) {
      setState('error');
      setError(err instanceof Error ? err.message : 'We could not add that item.');
    } finally {
      setState('idle');
    }
  }

  return (
    <div className="mt-6 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="sr-only" htmlFor="qty">
          Quantity
        </label>
        <select
          id="qty"
          value={quantity}
          onChange={(e) => setQuantity(Number(e.target.value))}
          disabled={disabled}
          className="field w-24 cursor-pointer py-2.5"
          aria-label="Quantity"
        >
          {Array.from({ length: Math.max(1, Math.min(available, 6)) }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <button type="button" onClick={submit} disabled={disabled} className="btn-solid min-w-[190px] flex-1">
          {state === 'saving' ? (
            <Spinner label="Adding" className="text-ivory-100/80" />
          ) : soldOut ? (
            'Sold out'
          ) : variantId == null ? (
            'Select size & colour'
          ) : added ? (
            'Added to bag ✓'
          ) : (
            'Add to bag'
          )}
        </button>
      </div>
      {available > 0 && available <= 3 ? (
        <p className="text-[12.5px] text-alert-warn">Only {available} left in this size.</p>
      ) : null}
      {error ? (
        <p role="alert" className="text-[12.5px] leading-relaxed text-alert-error">
          {error}
        </p>
      ) : null}
      {isSample ? (
        <p className="border border-sand-500/40 bg-sand-100/70 px-3 py-2 text-[12px] leading-relaxed text-ink-600">
          This is a <strong className="font-semibold">development sample</strong>: the artwork, price and stock are
          fictional, and it is not real inventory. It can only be used to test the journey — never to take a real
          payment.
        </p>
      ) : null}
    </div>
  );
}
