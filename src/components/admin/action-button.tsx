'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCart } from '../providers.tsx';

/**
 * Thin client wrapper around the admin JSON APIs: posts, surfaces the server's
 * error text verbatim (it is already written for customers/staff, never internals),
 * and refreshes the server component so the table reflects the new state.
 */
export function ActionButton({
  path,
  body,
  label,
  tone = 'quiet',
  confirm,
  disabled,
  small = false,
  method = 'POST',
}: {
  path: string;
  body?: Record<string, unknown>;
  label: string;
  tone?: 'quiet' | 'solid' | 'danger';
  confirm?: string;
  disabled?: boolean;
  small?: boolean;
  method?: 'POST' | 'DELETE';
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();
  const { toast } = useCart();

  async function run() {
    if (confirm && !window.confirm(confirm)) return;
    setBusy(true);
    setMsg(null);
    try {
      const csrf = document.cookie.match(/kb_csrf=([^;]+)/)?.[1] ?? '';
      const res = await fetch(path, {
        method,
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf },
        credentials: 'same-origin',
        body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined,
      });
      const text = await res.text();
      const data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
      if (!res.ok) throw new Error((data.error as string) ?? 'That action failed.');
      toast((data.message as string) ?? `${label} — done`, 'ok');
      router.refresh();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const styles =
    tone === 'solid'
      ? 'bg-ink text-ivory-100 hover:bg-ink-700'
      : tone === 'danger'
        ? 'border border-alert-error/40 bg-white text-alert-error hover:bg-alert-error/5'
        : 'border border-stone-300 bg-white text-ink hover:border-ink-300';

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={run}
        disabled={busy || disabled}
        className={`${styles} ${small ? 'px-2.5 py-1 text-[11.5px]' : 'px-4 py-2 text-[11.5px]'} rounded-xs uppercase tracking-widest transition disabled:opacity-45`}
      >
        {busy ? 'Working…' : label}
      </button>
      {msg ? <span className="max-w-[280px] text-[11.5px] leading-snug text-alert-error">{msg}</span> : null}
    </span>
  );
}
