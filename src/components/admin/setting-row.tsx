'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ReviewBadge } from '../ui/badge.tsx';

export type SettingKind = 'string' | 'number' | 'boolean' | 'list' | 'json' | 'secret';

/**
 * One editable setting. Writes go through the allowlisted admin endpoint, and the
 * “this is now approved” flag is a deliberate extra step: the storefront keeps
 * printing “not configured yet” until the owner says the value is real.
 */
export function SettingRow({
  settingKey,
  label,
  kind,
  initial,
  hint,
  needsReview,
  source,
  updatedAt,
}: {
  settingKey: string;
  label: string;
  kind: SettingKind;
  initial: unknown;
  hint?: string;
  needsReview: boolean;
  source: string;
  updatedAt: string;
}) {
  const router = useRouter();
  const isSecret = kind === 'secret';
  const [text, setText] = useState<string>(() => {
    if (isSecret) return '';
    if (kind === 'list') return Array.isArray(initial) ? (initial as string[]).join(', ') : '';
    if (kind === 'json') return typeof initial === 'string' ? initial : JSON.stringify(initial ?? null, null, 0);
    return initial == null ? '' : String(initial);
  });
  const [flag, setFlag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const blank = text.trim() === '';
  const unchanged = blank ? initial == null : text === (typeof initial === 'string' ? initial : String(initial ?? ''));

  async function save() {
    setBusy(true);
    setMsg(null);
    let value: unknown;
    if (blank) value = null;
    else if (kind === 'number') value = Number(text);
    else if (kind === 'boolean') value = text === 'true';
    else if (kind === 'list') value = text.split(',').map((s) => s.trim()).filter(Boolean);
    else if (kind === 'json') {
      try {
        value = JSON.parse(text) as unknown;
      } catch {
        setMsg('That is not valid JSON — nothing was saved.');
        setBusy(false);
        return;
      }
    } else value = text;
    try {
      const csrf = document.cookie.match(/kb_csrf=([^;]+)/)?.[1] ?? '';
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf },
        credentials: 'same-origin',
        body: JSON.stringify({ key: settingKey, value, clearReview: flag }),
      });
      const data = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) {
        setMsg(data.error ?? 'The setting was not saved.');
        return;
      }
      router.refresh();
    } catch {
      setMsg('The request did not complete.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="border-b border-stone-200 py-3 last:border-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <label htmlFor={`set-${settingKey}`} className="text-[13px] font-medium text-ink">
          {label}
        </label>
        <code className="text-[11.5px] text-ink-400">{settingKey}</code>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        {kind === 'boolean' ? (
          <select
            id={`set-${settingKey}`}
            className="field max-w-[220px] py-1.5 text-[12.5px]"
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={isSecret}
          >
            <option value="true">on</option>
            <option value="false">off</option>
          </select>
        ) : kind === 'json' || kind === 'list' ? (
          <textarea
            id={`set-${settingKey}`}
            rows={2}
            className="field max-w-[420px] flex-1 py-1.5 font-mono text-[12px]"
            value={text}
            placeholder={kind === 'list' ? 'formal, party-wear' : 'e.g. 499000 or {"zone":"IN"}'}
            onChange={(e) => setText(e.target.value)}
          />
        ) : (
          <input
            id={`set-${settingKey}`}
            type={kind === 'number' ? 'number' : isSecret ? 'password' : 'text'}
            className="field max-w-[420px] flex-1 py-1.5 text-[12.5px]"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={isSecret ? 'stored outside the app — set it in the environment' : kind === 'number' ? 'leave blank to mark as unconfigured' : ''}
            autoComplete="off"
          />
        )}
        <button
          type="button"
          onClick={save}
          disabled={busy || unchanged || isSecret}
          className="btn-outline whitespace-nowrap py-1.5 text-[11.5px] disabled:opacity-40"
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
        {needsReview ? (
          <label className="flex items-center gap-1.5 text-[11.5px] text-ink-500">
            <input type="checkbox" className="h-3.5 w-3.5 accent-[#1a1815]" checked={flag} onChange={(e) => setFlag(e.target.checked)} />
            approved by owner
          </label>
        ) : null}
        {needsReview ? <ReviewBadge label="Awaiting approval" /> : null}
      </div>
      {msg ? <p className="mt-1 text-[11.5px] text-alert-error">{msg}</p> : null}
      {hint ? <p className="mt-1 text-[11.5px] leading-snug text-ink-400">{hint}</p> : null}
      <p className="mt-1 text-[11.5px] text-ink-400">
        source: {source} · last change {updatedAt.slice(0, 16).replace('T', ' ')}
      </p>
    </li>
  );
}
