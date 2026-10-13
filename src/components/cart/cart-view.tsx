'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch, emitCart } from '../providers.tsx';
import { Price } from '../ui/price.tsx';
import { QuantityStepper } from '../product/quantity-stepper.tsx';
import { Spinner } from '../ui/spinner.tsx';
import { Badge, SampleBadge } from '../ui/badge.tsx';

export type CartLine = {
  variantId: number;
  productId: number;
  slug: string;
  title: string;
  sku: string;
  size: string | null;
  color: string | null;
  quantity: number;
  available: number;
  unitPriceCents: number;
  compareAtCents: number | null;
  lineTotalCents: number;
  imageUrl: string | null;
  isSample: boolean;
  unavailable: boolean;
};

export type CartQuote = {
  lines: CartLine[];
  itemCount: number;
  subtotalCents: number;
  discountCents: number;
  couponCode: string | null;
  couponDiscountCents: number;
  taxCents: number;
  taxMode: 'inclusive' | 'exclusive' | 'unconfigured';
  shippingCents: number;
  shipping: { method: string; label: string; note: string | null; mode: string } | null;
  totalCents: number;
  currency: string;
  blocked: { code: string; message: string } | null;
  empty: boolean;
  message?: string | null;
};

const EMPTY: CartQuote = {
  lines: [],
  itemCount: 0,
  subtotalCents: 0,
  discountCents: 0,
  couponCode: null,
  couponDiscountCents: 0,
  taxCents: 0,
  taxMode: 'unconfigured',
  shippingCents: 0,
  shipping: null,
  totalCents: 0,
  currency: 'INR',
  blocked: null,
  empty: true,
};

export function useCartQuote(open?: boolean) {
  const [quote, setQuote] = useState<CartQuote>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const res = await fetch('/api/cart', { credentials: 'same-origin' });
      if (!res.ok) {
        if (res.status === 401) {
          setQuote(EMPTY);
          return;
        }
        throw new Error('Could not load your bag.');
      }
      const data = (await res.json()) as CartQuote;
      setQuote(data);
      setError(null);
    } catch {
      setError('We could not load your bag. Please refresh.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (open) void reload();
  }, [open, reload]);

  return { quote, loading, error, reload, setQuote };
}

export function CartView({
  variant = 'page',
  onCheckoutClick,
}: {
  variant?: 'page' | 'drawer';
  onCheckoutClick?: () => void;
}) {
  const { quote, loading, error, reload } = useCartQuote();
  const [pending, setPending] = useState<number | null>(null);
  const [coupon, setCoupon] = useState(quote.couponCode ?? '');
  const [couponMsg, setCouponMsg] = useState<string | null>(null);

  async function changeQty(variantId: number, quantity: number) {
    setPending(variantId);
    try {
      if (quantity === 0) {
        await apiFetch(`/api/cart?variantId=${String(variantId)}`, { method: 'DELETE' });
      } else {
        await apiFetch('/api/cart', { method: 'PATCH', body: { variantId, quantity } });
      }
      await reload();
    } catch (err) {
      setCouponMsg(err instanceof Error ? err.message : 'Could not update your bag.');
    } finally {
      setPending(null);
    }
  }

  async function applyCoupon() {
    setPending(-1);
    setCouponMsg(null);
    try {
      const res = await apiFetch<{ message: string; ok: boolean }>('/api/cart/coupon', {
        method: 'POST',
        body: { code: coupon },
      });
      setCouponMsg(res.message);
      await reload();
    } catch (err) {
      setCouponMsg(err instanceof Error ? err.message : 'Could not apply that code.');
    } finally {
      setPending(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner label="Loading your bag" />
      </div>
    );
  }

  const hasSample = quote.lines.some((l) => l.isSample);
  const blocked = quote.blocked && quote.blocked.code !== 'shipping_unconfigured' && quote.blocked.code !== 'checkout_disabled';

  return (
    <div className={variant === 'drawer' ? 'flex h-full flex-col' : ''}>
      {quote.empty ? (
        <div className="flex flex-col items-start gap-4 px-1 py-10">
          <p className="font-display text-[26px] leading-tight">Your bag is empty.</p>
          <p className="max-w-prose text-[14px] leading-relaxed text-ink-500">
            Start with the pieces our customers reach for most — shirts, trousers and knitwear cut for the working
            week.
          </p>
          <Link href="/shop" onClick={variant === 'drawer' ? undefined : undefined} className="btn-solid">
            Browse the collection
          </Link>
        </div>
      ) : (
        <>
          <ul className="divide-y divide-stone-200">
            {quote.lines.map((line) => (
              <li key={line.variantId} className="flex gap-4 py-4">
                <Link href={`/product/${line.slug}`} className="block w-[74px] shrink-0">
                  <span className="product-frame block aspect-[3/4] w-full overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={line.imageUrl ?? `/media/sample/${line.slug}/0.svg`}
                      alt={`${line.title} thumbnail`}
                      width={900}
                      height={1200}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  </span>
                </Link>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`/product/${line.slug}`} className="font-display text-[16px] leading-snug hover:underline">
                        {line.title}
                      </Link>
                      <p className="mt-0.5 text-[12px] text-ink-600">
                        {[line.size, line.color].filter(Boolean).join(' · ') || 'One size'}
                      </p>
                      <p className="text-[12px] tracking-label text-stone-500">{line.sku}</p>
                    </div>
                    <Price cents={line.lineTotalCents} size="sm" className="shrink-0" />
                  </div>
                  <div className="mt-2.5 flex flex-wrap items-center gap-3">
                    <QuantityStepper
                      value={line.quantity}
                      min={0}
                      max={Math.max(1, line.available)}
                      size="sm"
                      disabled={pending === line.variantId}
                      onChange={(next) => void changeQty(line.variantId, next)}
                    />
                    {line.available <= 0 ? (
                      <Badge tone="error">Sold out</Badge>
                    ) : line.quantity >= line.available ? (
                      <span className="text-[11.5px] text-alert-warn">Max available: {line.available}</span>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void changeQty(line.variantId, 0)}
                      className="text-[12px] tracking-label text-ink-600 underline-offset-4 hover:text-alert-error hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                  {line.isSample ? (
                    <p className="mt-2 flex items-center gap-2 text-[11.5px] text-ink-600">
                      <SampleBadge /> development sample — not real inventory
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-2 space-y-3 border-t border-stone-200 pt-4">
            <div className="flex items-center gap-2">
              <label htmlFor="coupon" className="sr-only">
                Discount code
              </label>
              <input
                id="coupon"
                value={coupon}
                onChange={(e) => setCoupon(e.target.value.toUpperCase())}
                placeholder="Discount code"
                className="field flex-1 py-2 text-base uppercase lg:text-[13px]"
                maxLength={40}
              />
              <button
                type="button"
                onClick={() => void applyCoupon()}
                disabled={pending === -1}
                className="btn-quiet whitespace-nowrap px-4 py-2 text-[11.5px]"
              >
                {pending === -1 ? 'Applying' : 'Apply'}
              </button>
            </div>
            {couponMsg ? (
              <p className="text-[12px] leading-relaxed text-ink-500" role="status">
                {couponMsg}
              </p>
            ) : null}
            <dl className="space-y-1.5 text-[13px]">
              <Row label="Subtotal" value={<Price cents={quote.subtotalCents} size="sm" />} />
              {quote.discountCents > 0 ? (
                <Row label="Saving" value={<span className="text-alert-ok">−<Price cents={quote.discountCents} size="sm" /></span>} />
              ) : null}
              <Row
                label="Delivery"
                value={
                  quote.shipping?.mode === 'unconfigured' ? (
                    <span className="text-[12px] text-ink-600">Not configured</span>
                  ) : (
                    <Price cents={quote.shippingCents} size="sm" />
                  )
                }
              />
              {quote.taxMode === 'exclusive' && quote.taxCents > 0 ? (
                <Row label="Tax" value={<Price cents={quote.taxCents} size="sm" />} />
              ) : null}
              <div className="flex items-baseline justify-between border-t border-stone-200 pt-2.5">
                <dt className="text-[12px] tracking-label text-ink-500">Total</dt>
                <dd>
                  <Price cents={quote.totalCents} size="lg" />
                </dd>
              </div>
            </dl>
            {quote.taxMode === 'unconfigured' ? (
              <p className="text-[11.5px] leading-relaxed text-ink-600">
                Taxes shown as “—” until the store’s tax configuration is approved.
              </p>
            ) : null}
            {hasSample ? (
              <p className="border border-sand-500/40 bg-sand-100/70 px-3 py-2 text-[11.5px] leading-relaxed text-ink-600">
                Your bag holds sample records. These exist for testing the checkout journey only — no real product will
                be dispatched.
              </p>
            ) : null}
            {error ? <p role="alert" className="text-[12px] text-alert-error">{error}</p> : null}
            {quote.blocked?.code === 'shipping_unconfigured' ? (
              <p className="text-[12px] leading-relaxed text-alert-warn">
                Checkout will stay closed until delivery rates are configured in the admin dashboard.
              </p>
            ) : null}
            <Link
              href={blocked ? '#' : '/checkout'}
              onClick={(e) => {
                if (blocked) e.preventDefault();
                onCheckoutClick?.();
              }}
              aria-disabled={blocked ? true : undefined}
              className={`btn-solid mt-1 block w-full ${blocked ? 'pointer-events-none opacity-45' : ''}`}
            >
              {blocked ? 'Checkout unavailable' : 'Proceed to checkout'}
            </Link>
            <Link href="/cart" className="btn-outline block w-full">
              View full bag
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="text-ink-500">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
