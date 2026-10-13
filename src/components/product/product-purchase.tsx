'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { apiFetch, emitCart } from '../providers.tsx';
import { useCart } from '../providers.tsx';
import { Price } from '../ui/price.tsx';
import { Spinner } from '../ui/spinner.tsx';
import { formatMoney } from '@/domain/money.ts';

export type VariantOption = {
  variantId: number;
  size: string | null;
  color: string | null;
  colorCode: string | null;
  priceCents: number;
  compareAtCents: number | null;
  available: number;
  sku: string;
};

export function ProductPurchase({
  variants,
  sizes,
  colors,
  soldOut,
  isSample,
  sizeGuideKey,
  productSlug,
  currency,
  taxNote,
  /** Deep-link support: /product/x?size=M opens with that size already chosen. */
  initialSize,
}: {
  variants: VariantOption[];
  sizes: string[];
  colors: { name: string; hex: string | null; inStock: boolean }[];
  soldOut: boolean;
  isSample: boolean;
  sizeGuideKey: string | null;
  productSlug: string;
  currency: string;
  taxNote: string | null;
  initialSize?: string | null;
}) {
  const [color, setColor] = useState<string | null>(colors.find((c) => c.inStock)?.name ?? colors[0]?.name ?? null);
  const [size, setSize] = useState<string | null>(
    initialSize && sizes.includes(initialSize) ? initialSize : null,
  );
  const [qty, setQty] = useState(1);
  const [status, setStatus] = useState<'idle' | 'saving'>('idle');
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const { toast, openDrawer } = useCart();

  // Colour choice drives the storefront gallery too, so the shopper always sees the
  // garment in the colourway they are actually buying.
  useEffect(() => {
    if (!color) return;
    window.dispatchEvent(new CustomEvent('kb:gallery-colour', { detail: { colour: color } }));
  }, [color]);

  const inColor = useMemo(
    () => variants.filter((v) => (color == null ? true : v.color === color)),
    [variants, color],
  );
  const selected = useMemo(
    () => inColor.find((v) => v.size === size) ?? null,
    [inColor, size],
  );
  const priceCents = selected?.priceCents ?? Math.min(...variants.map((v) => v.priceCents));
  const compareAt = selected?.compareAtCents ?? null;
  const available = selected?.available ?? 0;
  const maxQty = Math.max(1, Math.min(available, 6));

  const sizeOptions = useMemo(
    () =>
      sizes.map((s) => {
        const v = inColor.find((x) => x.size === s);
        return { size: s, available: v?.available ?? 0, exists: Boolean(v) };
      }),
    [sizes, inColor],
  );

  async function add() {
    if (!selected) return;
    setStatus('saving');
    setMessage(null);
    try {
      const res = await apiFetch<{ itemCount: number; message?: string | null }>('/api/cart', {
        method: 'POST',
        body: { variantId: selected.variantId, quantity: qty },
      });
      emitCart({ count: res.itemCount, route: true });
      const text = res.message ?? `Added — ${qty} × ${selected.size}${selected.color ? `, ${selected.color}` : ''}`;
      setMessage({ tone: 'ok', text });
      toast(text, 'ok');
      openDrawer();
    } catch (err) {
      const text = err instanceof Error ? err.message : 'We could not add that item.';
      setMessage({ tone: 'error', text });
      toast(text, 'error');
    } finally {
      setStatus('idle');
    }
  }

  if (soldOut || variants.length === 0) {
    return (
      <div className="mt-7 space-y-4 border border-stone-200 bg-white/60 p-5">
        <p className="font-display text-[19px]">Sold out</p>
        <p className="text-[13.5px] leading-relaxed text-ink-500">
          Every size of this style is currently held elsewhere. Restock dates are not published, so we will not guess
          one — <Link href="/contact" className="underline underline-offset-4">tell us your size</Link> and we will
          note your interest.
        </p>
        <Price cents={priceCents} compareAt={compareAt} currency={currency} />
      </div>
    );
  }

  return (
    <div className="mt-7 space-y-5">
      <div className="flex items-baseline gap-3">
        <Price cents={priceCents} compareAt={compareAt} currency={currency} size="lg" />
        {compareAt && compareAt > priceCents ? (
          <span className="rounded-xs bg-ink px-1.5 py-0.5 text-[12px] tracking-label text-ivory-100">
            Save {formatMoney(compareAt - priceCents, currency)}
          </span>
        ) : null}
      </div>
      {taxNote ? <p className="text-[12px] leading-relaxed text-ink-400">{taxNote}</p> : null}

      {colors.length > 1 ? (
        <fieldset>
          <legend className="label">Colour — {color ?? 'any'}</legend>
          <div className="flex flex-wrap gap-2">
            {colors.map((c) => (
              <button
                key={c.name}
                type="button"
                onClick={() => {
                  setColor(c.name);
                  setSize(null);
                }}
                aria-pressed={color === c.name}
                className={`group flex items-center gap-2 rounded-xs border px-2 py-1.5 text-[12.5px] transition ${
                  color === c.name ? 'border-ink bg-white shadow-inset' : 'border-stone-300 hover:border-ink-300'
                } ${c.inStock ? '' : 'opacity-55'}`}
              >
                <span
                  aria-hidden="true"
                  className="inline-block h-4 w-4 rounded-full border border-ink/15"
                  style={{ background: c.hex ?? '#dedad3' }}
                />
                {c.name}
                {!c.inStock ? <span className="text-[12px] tracking-label text-alert-error">sold out</span> : null}
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}

      <fieldset>
        <legend className="label flex items-center gap-3">
          Size {size ? <span className="text-ink normal-case tracking-normal">· {size}</span> : null}
          {sizeOptions.some((s) => s.exists && s.available === 0) ? (
            <span className="text-[12px] tracking-label text-stone-400">grey = sold out</span>
          ) : null}
        </legend>
        <div className="flex flex-wrap gap-2">
          {sizeOptions.map((s) => (
            <button
              key={s.size}
              type="button"
              disabled={!s.exists || s.available === 0}
              onClick={() => {
                setSize(s.size);
                setQty(1);
              }}
              aria-pressed={size === s.size}
              className={`min-w-[52px] rounded-xs border px-3 py-2 text-[13px] transition ${
                size === s.size
                  ? 'border-ink bg-ink text-ivory-100'
                  : s.exists && s.available > 0
                    ? 'border-stone-300 bg-white hover:border-ink'
                    : 'cursor-not-allowed border-stone-200 bg-stone-100 text-stone-400 line-through'
              }`}
            >
              {s.size}
            </button>
          ))}
        </div>
        {sizeGuideKey ? (
          <Link href={`/size-guide?fit=${sizeGuideKey}`} className="mt-2 inline-block text-[12px] tracking-label text-ink-500 underline-offset-4 hover:text-ink hover:underline">
            Size guide &amp; measurements
          </Link>
        ) : null}
      </fieldset>

      {selected ? (
        <div className="flex flex-wrap items-center gap-3">
          <label className="label mb-0" htmlFor="pdp-qty">
            Quantity
          </label>
          <select
            id="pdp-qty"
            value={qty}
            onChange={(e) => setQty(Number(e.target.value))}
            className="field w-20 cursor-pointer py-2"
          >
            {Array.from({ length: maxQty }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <p className="text-[12.5px] text-ink-400">
            {available <= 3 ? `Only ${available} left` : `${available} available`} · SKU {selected.sku}
          </p>
        </div>
      ) : (
        <p className="text-[12.5px] text-ink-400">Choose a size{colors.length > 1 ? ' and colour' : ''} to see availability.</p>
      )}

      <button type="button" onClick={add} disabled={!selected || status === 'saving'} className="btn-solid w-full py-3.5">
        {status === 'saving' ? <Spinner label="Adding to bag" className="text-ivory-100/80" /> : 'Add to bag'}
      </button>

      {message ? (
        <p role="status" className={`text-[12.5px] leading-relaxed ${message.tone === 'ok' ? 'text-alert-ok' : 'text-alert-error'}`}>
          {message.text}
        </p>
      ) : null}

      {isSample ? (
        <p className="border border-dashed border-sand-500/60 bg-sand-100/70 px-3.5 py-2.5 text-[12px] leading-relaxed text-ink-600">
          <strong className="font-semibold">Development sample.</strong> The artwork, price and stock on this page are
          fictional placeholders used to build the store. This is not a real stocked item and cannot be bought for real
          money.
        </p>
      ) : null}

      <ul className="grid gap-2 border-t border-stone-200 pt-4 text-[12.5px] leading-relaxed text-ink-500 sm:grid-cols-2">
        <li>Delivery: {`quoted at checkout once the courier setup is approved`}</li>
        <li>Returns: policy pending owner approval — see <Link href="/policies/returns" className="underline underline-offset-4">returns</Link></li>
        <li>Secure checkout, no card details stored on our servers</li>
        <li>Questions? <Link href="/contact" className="underline underline-offset-4">Contact us</Link></li>
      </ul>
    </div>
  );
}
