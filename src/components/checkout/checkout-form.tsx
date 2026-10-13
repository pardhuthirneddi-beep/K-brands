'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, emitCart } from '../providers.tsx';
import { Price } from '../ui/price.tsx';
import { Spinner } from '../ui/spinner.tsx';
import { INDIAN_STATES } from '@/domain/constants.ts';
import { formatMoney } from '@/domain/money.ts';

type Quote = {
  lines: { title: string; size: string | null; color: string | null; quantity: number; lineTotalCents: number; isSample: boolean }[];
  itemCount: number;
  subtotalCents: number;
  discountCents: number;
  couponCode: string | null;
  shippingCents: number;
  shipping: { mode: string; note: string | null } | null;
  taxCents: number;
  taxMode: string;
  totalCents: number;
  currency: string;
  blocked: { code: string; message: string } | null;
};

const FIELDS = [
  ['recipientName', 'Full name', 'text', true],
  ['phone', 'Mobile number', 'tel', true],
  ['line1', 'Flat / house no., building, street', 'text', true],
  ['line2', 'Area, landmark (optional)', 'text', false],
  ['locality', 'Locality (optional)', 'text', false],
  ['city', 'City / district', 'text', true],
  ['pincode', 'PIN code', 'text', true],
] as const;

export function CheckoutForm({ initialEmail, initialPhone, allowCod }: { initialEmail: string; initialPhone: string; allowCod: boolean }) {
  const router = useRouter();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [useCod, setUseCod] = useState(false);
  const [sameBilling, setSameBilling] = useState(true);
  const idemRef = useRef('');

  const [form, setForm] = useState({
    email: initialEmail,
    phone: initialPhone,
    recipientName: '',
    line1: '',
    line2: '',
    locality: '',
    city: '',
    stateCode: 'MH',
    pincode: '',
    customerNote: '',
  });

  useEffect(() => {
    // A per-session idempotency key makes a double-click or a refresh-after-post
    // impossible to turn into two orders. Regenerated only after a failure.
    idemRef.current = `ck-${crypto.randomUUID()}`;
    void (async () => {
      try {
        const res = await fetch('/api/cart', { credentials: 'same-origin' });
        if (res.ok) setQuote((await res.json()) as Quote);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const canSubmit = useMemo(() => {
    if (!quote || quote.blocked || quote.lines.length === 0) return false;
    return ['email', 'phone', 'recipientName', 'line1', 'city', 'stateCode', 'pincode'].every((k) =>
      String((form as unknown as Record<string, string>)[k] ?? '').trim().length > 0,
    );
  }, [quote, form]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setErrors({});
    setFormError(null);
    try {
      const address = {
        recipientName: form.recipientName,
        phone: form.phone,
        line1: form.line1,
        line2: form.line2 || null,
        locality: form.locality || null,
        city: form.city,
        stateCode: form.stateCode,
        pincode: form.pincode,
        countryCode: 'IN',
      };
      const res = await apiFetch<{ redirect?: string; message?: string; paymentUnavailable?: boolean; payment?: { mode: string } }>(
        '/api/checkout',
        {
          method: 'POST',
          body: {
            email: form.email,
            phone: form.phone,
            shipping: address,
            billingSame: sameBilling,
            billing: sameBilling ? undefined : address,
            useCod,
            customerNote: form.customerNote || undefined,
            idempotencyKey: idemRef.current,
          },
        },
      );
      emitCart({ count: 0, drawer: false, route: true });
      if (res.redirect) {
        router.push(res.redirect);
        return;
      }
      setFormError(res.message ?? 'We could not place the order.');
    } catch (err) {
      const e = err as { message?: string; data?: { fieldErrors?: Record<string, string> } };
      setFormError(e.message ?? 'We could not place the order.');
      if (e.data?.fieldErrors) setErrors(e.data.fieldErrors as Record<string, string>);
      idemRef.current = `ck-${crypto.randomUUID()}`;
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="py-20 text-center"><Spinner label="Loading checkout" /></div>;

  if (!quote || quote.lines.length === 0) {
    return (
      <div className="border border-dashed border-stone-300 bg-white/60 p-8 text-center">
        <h2 className="font-display text-[22px]">There is nothing to check out</h2>
        <p className="mx-auto mt-2 max-w-md text-[13.5px] leading-relaxed text-ink-500">
          Your bag is empty or its contents changed. Add a piece and return here.
        </p>
        <a href="/shop" className="btn-solid mt-5 inline-flex">Back to the shop</a>
      </div>
    );
  }

  const shippingUnconfigured = quote.shipping?.mode === 'unconfigured';

  return (
    <form onSubmit={submit} className="grid gap-10 lg:grid-cols-[1.25fr_0.75fr]" noValidate>
      <div className="space-y-8">
        {formError ? (
          <div role="alert" className="border border-alert-error/35 bg-alert-error/5 px-4 py-3 text-[13px] leading-relaxed text-alert-error">
            {formError}
          </div>
        ) : null}

        <fieldset className="space-y-4">
          <legend className="display-section text-[20px]">1 · Contact</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="email" label="Email" type="email" value={form.email} error={errors.email}
              onChange={(v) => setForm((f) => ({ ...f, email: v }))} autoComplete="email" required />
            <Field id="phone" label="Mobile number" type="tel" value={form.phone} error={errors.phone}
              onChange={(v) => setForm((f) => ({ ...f, phone: v.replace(/\D/g, '').slice(0, 10) }))}
              inputMode="numeric" autoComplete="tel" hint="Used for delivery updates only" required />
          </div>
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="display-section text-[20px]">2 · Delivery address</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            {FIELDS.map(([name, label, type, required]) => (
              <div key={name} className={name === 'line1' ? 'sm:col-span-2' : ''}>
                <Field
                  id={name}
                  label={label}
                  type={type}
                  value={(form as unknown as Record<string, string>)[name] ?? ''}
                  error={errors[`shipping.${name}`] ?? errors[name]}
                  onChange={(v) =>
                    setForm((f) => ({ ...f, [name]: name === 'pincode' ? v.replace(/\D/g, '').slice(0, 6) : v }))
                  }
                  required={required}
                  inputMode={name === 'pincode' || name === 'phone' ? 'numeric' : undefined}
                />
              </div>
            ))}
            <div>
              <label htmlFor="stateCode" className="label">State</label>
              <select
                id="stateCode"
                value={form.stateCode}
                onChange={(e) => setForm((f) => ({ ...f, stateCode: e.target.value }))}
                className="field"
                required
              >
                {INDIAN_STATES.map((s) => (
                  <option key={s.code} value={s.code}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-[12px] leading-relaxed text-ink-400">
            We deliver within India only at this stage. International destinations stay closed until delivery, duties
            and returns support are confirmed.
          </p>
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="display-section text-[20px]">3 · Payment</legend>
          <div className="space-y-2.5">
            <label className={`flex cursor-pointer items-start gap-3 border p-4 transition ${!useCod ? 'border-ink bg-white shadow-inset' : 'border-stone-300 bg-white/60'}`}>
              <input type="radio" name="pay" checked={!useCod} onChange={() => setUseCod(false)} className="mt-1 h-4 w-4 accent-[#1b1a17]" />
              <span>
                <span className="block text-[14px] font-medium">Pay online (card, UPI, net banking)</span>
                <span className="mt-0.5 block text-[12.5px] leading-relaxed text-ink-500">
                  {quote.shipping?.mode === 'unconfigured'
                    ? 'Unavailable: delivery pricing is not configured yet.'
                    : 'No payment provider is connected in this build, so this step is exercised through a test adapter only.'}
                </span>
              </span>
            </label>
            <label className={`flex items-start gap-3 border p-4 transition ${allowCod && !useCod ? '' : ''} ${useCod ? 'border-ink bg-white shadow-inset' : 'border-stone-300 bg-white/60'} ${allowCod ? 'cursor-pointer' : 'cursor-not-allowed opacity-55'}`}>
              <input
                type="radio"
                name="pay"
                disabled={!allowCod}
                checked={useCod}
                onChange={() => setUseCod(true)}
                className="mt-1 h-4 w-4 accent-[#1b1a17]"
              />
              <span>
                <span className="block text-[14px] font-medium">Cash on delivery</span>
                <span className="mt-0.5 block text-[12.5px] leading-relaxed text-ink-500">
                  {allowCod
                    ? 'Available for eligible PIN codes; any COD handling fee is added below.'
                    : 'Not offered yet — COD stays disabled until the owner approves it and the courier confirms support.'}
                </span>
              </span>
            </label>
          </div>
          <label className="flex cursor-pointer items-center gap-2.5 text-[13px] text-ink-600">
            <input type="checkbox" checked={sameBilling} onChange={(e) => setSameBilling(e.target.checked)} className="h-4 w-4 accent-[#1b1a17]" />
            Billing address is the same as delivery
          </label>
          <div>
            <label htmlFor="customerNote" className="label">Order note (optional)</label>
            <textarea
              id="customerNote"
              rows={2}
              maxLength={500}
              value={form.customerNote}
              onChange={(e) => setForm((f) => ({ ...f, customerNote: e.target.value }))}
              className="field resize-y"
              placeholder="Gift wrap, floor number, gate code…"
            />
          </div>
        </fieldset>
      </div>

      <aside className="lg:sticky lg:top-24 h-fit space-y-4">
        <div className="card p-5">
          <h2 className="eyebrow mb-3">Order summary</h2>
          <ul className="divide-y divide-stone-200 border-y border-stone-200">
            {quote.lines.map((l, i) => (
              <li key={i} className="flex items-start justify-between gap-3 py-2.5 text-[13px]">
                <span className="min-w-0">
                  <span className="block truncate">{l.title}</span>
                  <span className="text-[11.5px] text-ink-400">
                    {[l.size, l.color].filter(Boolean).join(' · ') || 'One size'} × {l.quantity}
                  </span>
                </span>
                <Price cents={l.lineTotalCents} size="sm" className="shrink-0" />
              </li>
            ))}
          </ul>
          <dl className="mt-3 space-y-1.5 text-[13px]">
            <Row label={`Subtotal (${quote.itemCount})`} value={<Price cents={quote.subtotalCents} size="sm" />} />
            {quote.discountCents > 0 ? (
              <Row label={quote.couponCode ? `Discount (${quote.couponCode})` : 'Discount'} value={<span className="text-alert-ok">−{formatMoney(quote.discountCents, quote.currency)}</span>} />
            ) : null}
            <Row
              label="Delivery"
              value={shippingUnconfigured ? <span className="text-[12px] text-alert-warn">Not configured</span> : <Price cents={quote.shippingCents} size="sm" />}
            />
            {quote.taxMode === 'exclusive' ? <Row label="Tax" value={<Price cents={quote.taxCents} size="sm" />} /> : null}
            <div className="flex items-baseline justify-between border-t border-stone-200 pt-2.5">
              <dt className="text-[12px] tracking-label text-ink-500">Total</dt>
              <dd><Price cents={quote.totalCents} size="lg" /></dd>
            </div>
          </dl>
          {quote.blocked ? (
            <p role="alert" className="mt-4 border border-alert-warn/35 bg-alert-warn/8 px-3 py-2 text-[12px] leading-relaxed text-alert-warn">
              {quote.blocked.message}
            </p>
          ) : null}
          <button type="submit" disabled={!canSubmit || submitting || shippingUnconfigured} className="btn-solid mt-4 w-full py-3.5">
            {submitting ? <Spinner label="Placing your order" className="text-ivory-100/80" /> : 'Place order'}
          </button>
          <p className="mt-3 text-[11.5px] leading-relaxed text-ink-400">
            Placing an order creates an order record on our server. Totals are recalculated at that moment, so a
            stale price on this screen is never charged.
          </p>
        </div>
      </aside>
    </form>
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

function Field({
  id,
  label,
  type,
  value,
  onChange,
  error,
  required,
  autoComplete,
  inputMode,
  hint,
}: {
  id: string;
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  required?: boolean;
  autoComplete?: string;
  inputMode?: string;
  hint?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        value={value}
        required={required}
        autoComplete={autoComplete}
        inputMode={inputMode as never}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? `${id}-desc` : undefined}
        onChange={(e) => onChange(e.target.value)}
        className="field"
      />
      {error ? (
        <p id={`${id}-desc`} className="mt-1 text-[12px] text-alert-error">{error}</p>
      ) : hint ? (
        <p id={`${id}-desc`} className="mt-1 text-[11.5px] text-ink-400">{hint}</p>
      ) : null}
    </div>
  );
}
