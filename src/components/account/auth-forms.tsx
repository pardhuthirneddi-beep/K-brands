'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { emitCart } from '../providers.tsx';

type Mode = 'login' | 'register' | 'forgot' | 'reset';

const COPY: Record<Mode, { title: string; sub: string; cta: string }> = {
  login: {
    title: 'Welcome back',
    sub: 'Sign in to see your orders, saved addresses and any active returns.',
    cta: 'Sign in',
  },
  register: {
    title: 'Create your account',
    sub: 'One account for orders, tracking, cancellations and returns.',
    cta: 'Create account',
  },
  forgot: {
    title: 'Reset your password',
    sub: 'We will send a link to the email address on your account.',
    cta: 'Email me a reset link',
  },
  reset: { title: 'Choose a new password', sub: 'Paste the link you received, then set a new password.', cta: 'Save new password' },
};

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') || (mode === 'login' ? '/account' : '/account');
  const [form, setForm] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    fullName: '',
    phone: '',
    token: params.get('token') ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setMessage(null);
    try {
      if (mode === 'login') {
        const res = await api<{ next?: string; user?: { role: string } }>('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email: form.email, password: form.password }),
        });
        emitCart({ route: true, drawer: false });
        router.push(res.user?.role === 'admin' ? '/admin' : next);
        router.refresh();
        return;
      }
      if (mode === 'register') {
        await api('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify({
            email: form.email,
            password: form.password,
            confirmPassword: form.confirmPassword,
            fullName: form.fullName,
            phone: form.phone,
          }),
        });
        emitCart({ route: true });
        router.push('/account');
        router.refresh();
        return;
      }
      if (mode === 'forgot') {
        const res = await api<{ message?: string }>('/api/auth/password-reset', {
          method: 'POST',
          body: JSON.stringify({ email: form.email }),
        });
        setMessage({ tone: 'ok', text: res.message ?? 'If an account exists, a reset link is on its way.' });
        return;
      }
      await api('/api/auth/password-reset', {
        method: 'POST',
        body: JSON.stringify({ token: form.token, password: form.password }),
      });
      setMessage({ tone: 'ok', text: 'Password updated. You can sign in now.' });
      router.push('/account/login');
    } catch (err) {
      const e2 = err as { message?: string; status?: number; data?: { fieldErrors?: Record<string, string> } };
      setErrors(e2.data?.fieldErrors ?? {});
      setMessage({ tone: 'error', text: e2.message ?? 'Something went wrong. Please try again.' });
    } finally {
      setBusy(false);
    }
  }

  const c = COPY[mode];
  const needsPassword = mode !== 'forgot';
  const showConfirm = mode === 'register';

  return (
    <div className="mx-auto w-full max-w-[440px]">
      <h1 className="display-section text-[30px]">{c.title}</h1>
      <p className="mt-2 text-[13.5px] leading-relaxed text-ink-500">{c.sub}</p>

      {message ? (
        <p
          role="status"
          className={`mt-5 border px-4 py-2.5 text-[13px] leading-relaxed ${
            message.tone === 'ok' ? 'border-alert-ok/30 bg-alert-ok/5 text-alert-ok' : 'border-alert-error/30 bg-alert-error/5 text-alert-error'
          }`}
        >
          {message.text}
        </p>
      ) : null}

      <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
        {mode === 'register' ? (
          <TextField id="fullName" label="Full name" value={form.fullName} onChange={set('fullName')} autoComplete="name" error={errors.fullName} required />
        ) : null}
        {mode !== 'reset' ? (
          <TextField id="email" label="Email" type="email" value={form.email} onChange={set('email')} autoComplete="email" error={errors.email} required />
        ) : (
          <TextField id="token" label="Reset token" value={form.token} onChange={set('token')} error={errors.token} required hint="From the link in your email" />
        )}
        {mode === 'register' ? (
          <TextField id="phone" label="Mobile (optional)" type="tel" inputMode="numeric" value={form.phone} onChange={set('phone')} autoComplete="tel" error={errors.phone} />
        ) : null}
        {needsPassword ? (
          <TextField
            id="password"
            label={mode === 'reset' ? 'New password' : 'Password'}
            type="password"
            value={form.password}
            onChange={set('password')}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            error={errors.password}
            required
            hint={mode !== 'login' ? 'At least 10 characters, with a letter and a number' : undefined}
          />
        ) : null}
        {showConfirm ? (
          <TextField id="confirmPassword" label="Confirm password" type="password" value={form.confirmPassword} onChange={set('confirmPassword')} autoComplete="new-password" error={errors.confirmPassword} required />
        ) : null}

        <button type="submit" disabled={busy} className="btn-solid w-full py-3">
          {busy ? 'Working…' : c.cta}
        </button>
      </form>

      <div className="mt-5 space-y-2 text-[13px] text-ink-500">
        {mode === 'login' ? (
          <>
            <p>
              New here?{' '}
              <Link href="/account/register" className="text-ink underline underline-offset-4">Create an account</Link>
            </p>
            <p>
              Forgotten your password?{' '}
              <Link href="/account/forgot-password" className="text-ink underline underline-offset-4">Reset it</Link>
            </p>
          </>
        ) : (
          <p>
            Already registered?{' '}
            <Link href="/account/login" className="text-ink underline underline-offset-4">Sign in</Link>
          </p>
        )}
      </div>
    </div>
  );
}

async function api<T = Record<string, unknown>>(path: string, init: RequestInit): Promise<T> {
  const csrf = document.cookie.match(/kb_csrf=([^;]+)/)?.[1];
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(csrf ? { 'x-csrf-token': csrf } : {}) },
    credentials: 'same-origin',
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw { message: (data as { error?: string }).error ?? 'Request failed', status: res.status, data };
  return data as T;
}

function TextField({
  id,
  label,
  type = 'text',
  value,
  onChange,
  error,
  hint,
  required,
  autoComplete,
  inputMode,
}: {
  id: string;
  label: string;
  type?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  error?: string;
  hint?: string;
  required?: boolean;
  autoComplete?: string;
  inputMode?: string;
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
        onChange={onChange}
        required={required}
        autoComplete={autoComplete}
        inputMode={inputMode as never}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? `${id}-d` : undefined}
        className="field"
      />
      {error ? (
        <p id={`${id}-d`} className="mt-1 text-[12px] text-alert-error">{error}</p>
      ) : hint ? (
        <p id={`${id}-d`} className="mt-1 text-[11.5px] text-ink-400">{hint}</p>
      ) : null}
    </div>
  );
}
