'use client';

import { useState } from 'react';

type State = 'idle' | 'busy' | 'ok' | 'error';

/**
 * Homepage newsletter. Validates client-side for speed, but the truth comes from the
 * server: a success line is only shown after /api/newsletter has written the row, and the
 * response's own delivery note is printed rather than a canned "check your inbox".
 */
export function NewsletterForm({ source = 'homepage' }: { source?: string }) {
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState<State>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (state === 'busy') return;
    if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email.trim())) {
      setState('error');
      setFieldError('Enter a valid email address.');
      return;
    }
    if (!consent) {
      setState('error');
      setFieldError('Please tick the consent box.');
      return;
    }
    setState('busy');
    setFieldError(null);
    try {
      const res = await fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), consent, source }),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string; deliveryNote?: string; error?: string };
      if (!res.ok || !data.ok) {
        setState('error');
        setMessage(data.error ?? 'That did not save. Please try again.');
        return;
      }
      setState('ok');
      setMessage(data.message ?? 'Saved.');
      setNote(data.deliveryNote ?? null);
      setEmail('');
      setConsent(false);
    } catch {
      setState('error');
      setMessage('We could not reach the server. Please try again.');
    }
  }

  return (
    <form onSubmit={submit} noValidate className="w-full max-w-md">
      <div className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor="newsletter-email" className="sr-only">
          Email address
        </label>
        <input
          id="newsletter-email"
          type="email"
          name="email"
          value={email}
          autoComplete="email"
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          aria-invalid={fieldError ? 'true' : undefined}
          className="field flex-1"
        />
        <button type="submit" className="btn-solid shrink-0" disabled={state === 'busy'}>
          {state === 'busy' ? 'Saving…' : 'Subscribe'}
        </button>
      </div>
      <label className="mt-3 flex items-start gap-2.5 text-[12.5px] leading-relaxed text-ink-500">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[#191919]"
        />
        <span>Email me K-brands launch and product news. I can unsubscribe at any time and my address will not be shared.</span>
      </label>
      {/* honeypot */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="absolute left-[-9999px] h-0 w-0 opacity-0" aria-hidden="true" readOnly />
      <p role="status" aria-live="polite" className="mt-2.5 min-h-[1.1rem] text-[12.5px] leading-relaxed">
        {state === 'error' || fieldError ? (
          <span className="text-alert-error">{fieldError ?? message}</span>
        ) : state === 'ok' ? (
          <span className="text-alert-ok">{message}</span>
        ) : null}
      </p>
      {state === 'ok' && note ? <p className="mt-1 text-[12px] leading-relaxed text-ink-600">{note}</p> : null}
    </form>
  );
}
