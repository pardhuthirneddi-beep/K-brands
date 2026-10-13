'use client';

import { useState } from 'react';

export function ContactForm() {
  const [form, setForm] = useState({ name: '', email: '', orderRef: '', topic: 'order', message: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [note, setNote] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState('sending');
    setErrors({});
    setNote(null);
    try {
      const csrf = document.cookie.match(/kb_csrf=([^;]+)/)?.[1] ?? '';
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf },
        credentials: 'same-origin',
        body: JSON.stringify({ ...form, website: '' }),
      });
      const data = (await res.json()) as { error?: string; message?: string; fieldErrors?: Record<string, string> };
      if (!res.ok) {
        setErrors(data.fieldErrors ?? { form: data.error ?? 'Please try again.' });
        setState('idle');
        return;
      }
      setNote(data.message ?? 'Message received.');
      setState('sent');
      setForm({ name: '', email: '', orderRef: '', topic: 'order', message: '' });
    } catch {
      setErrors({ form: 'We could not send that. Please try again.' });
      setState('idle');
    }
  }

  if (state === 'sent') {
    return (
      <div role="status" className="mt-8 border border-alert-ok/30 bg-alert-ok/5 px-5 py-6">
        <p className="font-display text-[20px] text-alert-ok">Message received</p>
        <p className="mt-2 text-[13.5px] leading-relaxed text-ink-600">{note}</p>
        <button type="button" onClick={() => setState('idle')} className="btn-outline mt-4">
          Send another
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-8 space-y-4" noValidate>
      {errors.form ? (
        <p role="alert" className="border border-alert-error/30 bg-alert-error/5 px-4 py-2.5 text-[13px] text-alert-error">
          {errors.form}
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="name" label="Your name" value={form.name} error={errors.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} autoComplete="name" />
        <Field id="email" label="Email" type="email" value={form.email} error={errors.email} onChange={(v) => setForm((f) => ({ ...f, email: v }))} autoComplete="email" />
        <Field id="orderRef" label="Order number (optional)" value={form.orderRef} error={errors.orderRef} onChange={(v) => setForm((f) => ({ ...f, orderRef: v.toUpperCase().slice(0, 30) }))} />
        <div>
          <label className="label" htmlFor="topic">
            Topic
          </label>
          <select id="topic" className="field" value={form.topic} onChange={(e) => setForm((f) => ({ ...f, topic: e.target.value }))}>
            {[
              ['order', 'An order'],
              ['product', 'A product or sizing'],
              ['returns', 'A return or refund'],
              ['press', 'Press or partnership'],
              ['other', 'Something else'],
            ].map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="label" htmlFor="message">
          Message
        </label>
        <textarea
          id="message"
          rows={6}
          maxLength={3000}
          required
          minLength={20}
          value={form.message}
          aria-invalid={errors.message ? true : undefined}
          aria-describedby={errors.message ? 'message-err' : undefined}
          onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
          className="field resize-y"
          placeholder="What do you need help with?"
        />
        {errors.message ? (
          <p id="message-err" className="mt-1 text-[12px] text-alert-error">
            {errors.message}
          </p>
        ) : (
          <p className="mt-1 text-[11.5px] text-ink-600">{form.message.length}/3000 · at least 20 characters</p>
        )}
      </div>
      {/* honeypot: humans never see or fill this */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        value={''}
        onChange={() => undefined}
        className="hidden"
      />
      <button type="submit" disabled={state === 'sending'} className="btn-solid">
        {state === 'sending' ? 'Sending…' : 'Send message'}
      </button>
    </form>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  type = 'text',
  error,
  autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  error?: string;
  autoComplete?: string;
}) {
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type={type}
        className="field"
        value={value}
        autoComplete={autoComplete}
        aria-invalid={error ? true : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      {error ? (
        <p className="mt-1 text-[12px] text-alert-error">{error}</p>
      ) : null}
    </div>
  );
}
