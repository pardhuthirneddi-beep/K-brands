'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCart } from '../providers.tsx';

async function call<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const csrf = document.cookie.match(/kb_csrf=([^;]+)/)?.[1];
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(csrf ? { 'x-csrf-token': csrf ?? '' } : {}) },
    body: JSON.stringify(body),
    credentials: 'same-origin',
  });
  const text = await res.text();
  const data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!res.ok) throw new Error((data.error as string) ?? 'Request failed');
  return data as T;
}

export function ProfileEditor({ initial }: { initial: { fullName: string; phone: string; email: string } }) {
  const [fullName, setFullName] = useState(initial.fullName);
  const [phone, setPhone] = useState(initial.phone);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const { toast } = useCart();
  const router = useRouter();

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await call<{ message: string }>('/api/account/profile', { fullName, phone });
      setMsg({ tone: 'ok', text: res.message ?? 'Saved.' });
      toast('Profile updated', 'ok');
      router.refresh();
    } catch (e) {
      setMsg({ tone: 'error', text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="pf-name">
            Full name
          </label>
          <input id="pf-name" className="field" value={fullName} maxLength={120} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="pf-phone">
            Mobile
          </label>
          <input
            id="pf-phone"
            className="field"
            value={phone}
            inputMode="numeric"
            maxLength={10}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
          />
        </div>
      </div>
      <p className="text-[12px] leading-relaxed text-ink-600">
        Email is <strong className="font-medium text-ink-600">{initial.email}</strong>. Changing the sign-in address
        requires a verification step, which is not part of this build yet.
      </p>
      {msg ? (
        <p role="status" className={`text-[12.5px] ${msg.tone === 'ok' ? 'text-alert-ok' : 'text-alert-error'}`}>
          {msg.text}
        </p>
      ) : null}
      <button type="button" onClick={save} disabled={busy || fullName.trim().length < 2} className="btn-solid">
        {busy ? 'Saving…' : 'Save changes'}
      </button>
    </div>
  );
}

export function PasswordChanger() {
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const router = useRouter();
  const mismatch = form.confirm.length > 0 && form.next !== form.confirm;

  async function change() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await call<{ message: string }>('/api/account/password', {
        currentPassword: form.current,
        newPassword: form.next,
      });
      setMsg({ tone: 'ok', text: res.message ?? 'Password updated.' });
      setForm({ current: '', next: '', confirm: '' });
      router.refresh();
    } catch (e) {
      setMsg({ tone: 'error', text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="pw-cur">
            Current password
          </label>
          <input
            id="pw-cur"
            type="password"
            className="field"
            autoComplete="current-password"
            value={form.current}
            onChange={(e) => setForm((f) => ({ ...f, current: e.target.value }))}
          />
        </div>
        <div>
          <label className="label" htmlFor="pw-new">
            New password
          </label>
          <input
            id="pw-new"
            type="password"
            className="field"
            autoComplete="new-password"
            aria-invalid={form.next.length > 0 && form.next.length < 10}
            value={form.next}
            onChange={(e) => setForm((f) => ({ ...f, next: e.target.value }))}
          />
        </div>
        <div>
          <label className="label" htmlFor="pw-conf">
            Confirm new
          </label>
          <input
            id="pw-conf"
            type="password"
            className="field"
            autoComplete="new-password"
            aria-invalid={mismatch}
            value={form.confirm}
            onChange={(e) => setForm((f) => ({ ...f, confirm: e.target.value }))}
          />
        </div>
      </div>
      {form.next.length > 0 && form.next.length < 10 ? (
        <p className="text-[12px] text-alert-warn">Use at least 10 characters, with a letter and a number.</p>
      ) : mismatch ? (
        <p className="text-[12px] text-alert-error">The two new passwords do not match.</p>
      ) : null}
      {msg ? (
        <p role="status" className={`text-[12.5px] ${msg.tone === 'ok' ? 'text-alert-ok' : 'text-alert-error'}`}>
          {msg.text}
        </p>
      ) : null}
      <button
        type="button"
        onClick={change}
        disabled={busy || form.current.length === 0 || form.next.length < 10 || mismatch}
        className="btn-solid"
      >
        {busy ? 'Updating…' : 'Change password'}
      </button>
    </div>
  );
}
