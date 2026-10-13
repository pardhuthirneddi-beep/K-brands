'use client';

import { useState } from 'react';
import { apiFetch } from '../providers.tsx';
import { CANCELLATION_REASONS, RETURN_REASONS } from '@/domain/constants.ts';

export function OrderActions({
  orderNumber,
  status,
  canRequestReturn,
  returnReason,
  signedIn,
}: {
  orderNumber: string;
  status: string;
  canRequestReturn: boolean;
  returnReason: string | null;
  signedIn: boolean;
}) {
  const [mode, setMode] = useState<'idle' | 'cancel' | 'return'>('idle');
  const [reason, setReason] = useState('');
  const [detail, setDetail] = useState('');
  const [lineId, setLineId] = useState('');
  const [type, setType] = useState<'return' | 'exchange'>('return');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const cancellable = ['pending_payment', 'awaiting_payment_confirmation', 'paid', 'awaiting_fulfilment', 'packed'].includes(status);

  async function send(path: string, body: Record<string, unknown>) {
    setBusy(true);
    setResult(null);
    try {
      const res = await apiFetch<{ message: string }>(path, { method: 'POST', body });
      setResult({ ok: true, message: res.message });
      setMode('idle');
      setReason('');
      setDetail('');
    } catch (err) {
      setResult({ ok: false, message: err instanceof Error ? err.message : 'We could not record that request.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="eyebrow">Need to change something?</h2>
      {result ? (
        <p
          role="status"
          className={`border px-4 py-2.5 text-[12.5px] leading-relaxed ${
            result.ok ? 'border-alert-ok/30 bg-alert-ok/5 text-alert-ok' : 'border-alert-error/30 bg-alert-error/5 text-alert-error'
          }`}
        >
          {result.message}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2.5">
        {cancellable ? (
          <button type="button" onClick={() => setMode(mode === 'cancel' ? 'idle' : 'cancel')} className="btn-quiet py-2 text-[11.5px]" aria-expanded={mode === 'cancel'}>
            Request cancellation
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => setMode(mode === 'return' ? 'idle' : 'return')}
          disabled={!signedIn}
          className="btn-quiet py-2 text-[11.5px]"
          aria-expanded={mode === 'return'}
        >
          Request a return
        </button>
      </div>
      {!signedIn ? (
        <p className="text-[12px] leading-relaxed text-ink-400">
          Sign in to raise a return so we can verify the order against your account.
        </p>
      ) : null}

      {mode === 'cancel' ? (
        <div className="card space-y-3 p-5">
          <p className="text-[13px] leading-relaxed text-ink-500">
            A cancellation request is recorded for review — it does not cancel the order or trigger a refund by itself.
          </p>
          <label className="block">
            <span className="label">Reason</span>
            <select value={reason} onChange={(e) => setReason(e.target.value)} className="field">
              <option value="">Choose one…</option>
              {CANCELLATION_REASONS.map((r) => (
                <option key={r.code} value={r.code}>{r.label}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">Anything else? (optional)</span>
            <textarea rows={2} maxLength={600} value={detail} onChange={(e) => setDetail(e.target.value)} className="field resize-y" />
          </label>
          <button
            type="button"
            disabled={busy || reason.length < 2}
            onClick={() => void send('/api/account/orders', { orderNumber, reason, detail })}
            className="btn-solid"
          >
            {busy ? 'Sending…' : 'Submit request'}
          </button>
        </div>
      ) : null}

      {mode === 'return' ? (
        <div className="card space-y-3 p-5">
          {!canRequestReturn ? (
            <p className="border border-alert-warn/30 bg-alert-warn/5 px-3 py-2 text-[12.5px] leading-relaxed text-alert-warn">
              {returnReason ?? 'A return cannot be requested for this order right now.'}
            </p>
          ) : (
            <p className="text-[13px] leading-relaxed text-ink-500">
              We will log the request and review it. No refund is issued automatically — you will see each step here.
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              <span className="label">Request type</span>
              <select value={type} onChange={(e) => setType(e.target.value as 'return' | 'exchange')} className="field" disabled={!canRequestReturn}>
                <option value="return">Return for review</option>
                <option value="exchange">Exchange</option>
              </select>
            </label>
            <label>
              <span className="label">Reason</span>
              <select value={reason} onChange={(e) => setReason(e.target.value)} className="field" disabled={!canRequestReturn}>
                <option value="">Choose one…</option>
                {RETURN_REASONS.map((r) => (
                  <option key={r.code} value={r.code}>{r.label}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="block">
            <span className="label">Detail (optional)</span>
            <textarea rows={3} maxLength={800} value={detail} onChange={(e) => setDetail(e.target.value)} className="field resize-y" disabled={!canRequestReturn} />
          </label>
          <input type="hidden" value={lineId} onChange={() => undefined} />
          <button
            type="button"
            disabled={busy || !canRequestReturn || reason.length < 2}
            onClick={() => void send('/api/account/returns', { orderNumber, reason, detail, type, orderLineId: lineId ? Number(lineId) : null })}
            className="btn-solid"
          >
            {busy ? 'Sending…' : 'Submit request'}
          </button>
        </div>
      ) : null}
    </section>
  );
}
