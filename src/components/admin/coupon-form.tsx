'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const EMPTY = {
  code: '',
  kind: 'percent',
  value: '10',
  minSubtotalCents: '0',
  maxDiscountCents: '',
  usageLimit: '',
  perUserLimit: '',
  startsAt: '',
  endsAt: '',
  active: true,
  isSample: true,
};

/** Coupon amounts are paise, and a percentage is a whole number — the API does the ×100. */
export function CouponForm() {
  const router = useRouter();
  const [v, setV] = useState({ ...EMPTY });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setMsg(null);
    try {
      const csrf = document.cookie.match(/kb_csrf=([^;]+)/)?.[1] ?? '';
      const res = await fetch('/api/admin/coupons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf },
        credentials: 'same-origin',
        body: JSON.stringify({
          code: v.code.toUpperCase(),
          kind: v.kind,
          value: Number(v.value || 0),
          minSubtotalCents: Number(v.minSubtotalCents || 0),
          maxDiscountCents: v.maxDiscountCents ? Number(v.maxDiscountCents) : null,
          usageLimit: v.usageLimit ? Number(v.usageLimit) : null,
          perUserLimit: v.perUserLimit ? Number(v.perUserLimit) : null,
          startsAt: v.startsAt ? `${v.startsAt}:00Z`.slice(0, 19) : null,
          endsAt: v.endsAt ? `${v.endsAt}:00Z`.slice(0, 19) : null,
          active: v.active,
          isSample: v.isSample,
        }),
      });
      const data = (await res.json()) as { error?: string; fieldErrors?: Record<string, string> };
      if (!res.ok) {
        setErrors(data.fieldErrors ?? {});
        setMsg(data.error ?? 'The code was not saved.');
        return;
      }
      setV({ ...EMPTY });
      router.refresh();
    } catch {
      setMsg('The request did not complete.');
    } finally {
      setBusy(false);
    }
  }

  const f = (name: keyof typeof EMPTY, label: string, type = 'text', hint?: string) => (
    <div>
      <label className="label" htmlFor={`c-${name}`}>
        {label}
      </label>
      {type === 'checkbox' ? (
        <label className="flex items-center gap-2 text-[13px] text-ink-600">
          <input
            id={`c-${name}`}
            type="checkbox"
            className="h-4 w-4 accent-[#1a1815]"
            checked={Boolean(v[name])}
            onChange={(e) => setV((p) => ({ ...p, [name]: e.target.checked }))}
          />
          {name === 'isSample' ? 'test code — not a live promotion' : 'active'}
        </label>
      ) : (
        <input
          id={`c-${name}`}
          type={type}
          className="field"
          value={String(v[name] ?? '')}
          onChange={(e) => setV((p) => ({ ...p, [name]: e.target.value }))}
        />
      )}
      {errors[name] ? <p className="mt-1 text-[12px] text-alert-error">{errors[name]}</p> : hint ? <p className="mt-1 text-[11.5px] text-ink-400">{hint}</p> : null}
    </div>
  );

  return (
    <form onSubmit={submit} className="space-y-4">
      {msg ? <p role="alert" className="border border-alert-error/30 bg-alert-error/5 px-3 py-2 text-[12px] text-alert-error">{msg}</p> : null}
      <div className="grid gap-4 sm:grid-cols-3">
        {f('code', 'Code', 'text')}
        <div>
          <label className="label" htmlFor="c-kind">
            Type
          </label>
          <select id="c-kind" className="field" value={v.kind} onChange={(e) => setV((p) => ({ ...p, kind: e.target.value }))}>
            <option value="percent">percentage</option>
            <option value="fixed">fixed amount (paise)</option>
          </select>
        </div>
        {f('value', v.kind === 'percent' ? 'Percent off' : 'Amount (paise)', 'number')}
        {f('minSubtotalCents', 'Minimum subtotal (paise)', 'number')}
        {f('maxDiscountCents', 'Maximum discount (paise)', 'number', 'optional cap for percentage codes')}
        {f('usageLimit', 'Total uses', 'number', 'blank = unlimited')}
        {f('perUserLimit', 'Uses per customer', 'number', 'blank = unlimited')}
        {f('startsAt', 'Starts (UTC)', 'datetime-local')}
        {f('endsAt', 'Ends (UTC)', 'datetime-local')}
        {f('active', 'Active', 'checkbox')}
        {f('isSample', 'Test code', 'checkbox')}
      </div>
      <button type="submit" disabled={busy} className="btn-solid py-2 text-[11.5px] disabled:opacity-45">
        {busy ? 'Saving…' : 'Save code'}
      </button>
    </form>
  );
}
