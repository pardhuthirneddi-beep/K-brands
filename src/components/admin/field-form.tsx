'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCart } from '../providers.tsx';

export type FormField = {
  name: string;
  label?: string;
  type?: 'text' | 'number' | 'textarea' | 'select' | 'checkbox' | 'hidden';
  value?: string | number | boolean | null;
  options?: { value: string; label: string }[];
  hint?: string;
  required?: boolean;
  prefix?: string;
  placeholder?: string;
};

/**
 * One component for every small admin write: renders the fields, POSTs JSON with the
 * CSRF header, shows the server's error message inline, and refreshes the server
 * component so the table is never stale after a mutation.
 */
export function FieldForm({
  path,
  method = 'POST',
  fields,
  submitLabel,
  title,
  note,
  confirm,
  resetOnSuccess = true,
  danger,
}: {
  path: string;
  method?: 'POST' | 'DELETE' | 'PUT';
  fields: FormField[];
  submitLabel: string;
  title?: string;
  note?: string;
  confirm?: string;
  resetOnSuccess?: boolean;
  danger?: boolean;
}) {
  const router = useRouter();
  const { toast } = useCart();
  const [state, setState] = useState<'idle' | 'busy'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string | number | boolean>>(() => {
    const out: Record<string, string | number | boolean> = {};
    for (const f of fields) out[f.name] = f.value ?? (f.type === 'checkbox' ? false : f.type === 'number' ? '' : '');
    return out;
  });

  function set(name: string, v: string | number | boolean) {
    setValues((prev) => ({ ...prev, [name]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (confirm && !window.confirm(confirm)) return;
    setState('busy');
    setError(null);
    try {
      const csrf = document.cookie.match(/kb_csrf=([^;]+)/)?.[1] ?? '';
      const body: Record<string, unknown> = {};
      for (const f of fields) {
        if (f.type === 'hidden') {
          if (f.value != null) body[f.name] = f.value;
          continue;
        }
        const raw = values[f.name];
        if (f.type === 'checkbox') body[f.name] = raw === true;
        else if (f.type === 'number') body[f.name] = raw === '' ? null : Number(raw);
        else body[f.name] = typeof raw === 'string' ? raw : String(raw ?? '');
      }
      const res = await fetch(path, {
        method,
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf },
        credentials: 'same-origin',
        body: Object.keys(body).length > 0 ? JSON.stringify(body) : undefined,
      });
      const text = await res.text();
      const data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
      if (!res.ok) {
        const fieldErrors = data.fieldErrors as Record<string, string> | undefined;
        setError(fieldErrors ? Object.values(fieldErrors).join(' ') : ((data.error as string) ?? 'That action failed.'));
        return;
      }
      const message = (data.message as string) ?? `${submitLabel} — saved`;
      toast(message, 'ok');
      if (resetOnSuccess) {
        setValues(() => {
          const out: Record<string, string | number | boolean> = {};
          for (const f of fields) if (f.type !== 'hidden') out[f.name] = f.type === 'checkbox' ? false : '';
          return out;
        });
      }
      router.refresh();
    } catch {
      setError('The request did not complete. Nothing was saved.');
    } finally {
      setState('idle');
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {title ? <p className="eyebrow">{title}</p> : null}
      {error ? (
        <p role="alert" className="border border-alert-error/30 bg-alert-error/5 px-3 py-2 text-[12px] leading-relaxed text-alert-error">
          {error}
        </p>
      ) : null}
      {fields.map((f) => {
        if (f.type === 'hidden') return null;
        return (
          <div key={f.name}>
            <label className="label" htmlFor={`${path}-${f.name}`}>
              {f.label ?? f.name}
            </label>
            {f.type === 'textarea' ? (
              <textarea
                id={`${path}-${f.name}`}
                rows={3}
                className="field resize-y text-base lg:text-[13px]"
                value={String(values[f.name] ?? '')}
                placeholder={f.placeholder}
                onChange={(e) => set(f.name, e.target.value)}
              />
            ) : f.type === 'select' ? (
              <select id={`${path}-${f.name}`} className="field" value={String(values[f.name] ?? '')} onChange={(e) => set(f.name, e.target.value)}>
                {(f.options ?? []).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : f.type === 'checkbox' ? (
              <label className="flex items-center gap-2 text-[13px] text-ink-600">
                <input
                  id={`${path}-${f.name}`}
                  type="checkbox"
                  className="h-4 w-4 accent-ink"
                  checked={values[f.name] === true}
                  onChange={(e) => set(f.name, e.target.checked)}
                />
                {f.label ?? f.name}
              </label>
            ) : (
              <div className="flex items-center gap-2">
                {f.prefix ? <span className="text-[13px] text-ink-600">{f.prefix}</span> : null}
                <input
                  id={`${path}-${f.name}`}
                  type={f.type === 'number' ? 'number' : 'text'}
                  className="field"
                  required={f.required}
                  placeholder={f.placeholder}
                  value={String(values[f.name] ?? '')}
                  onChange={(e) => set(f.name, f.type === 'number' ? e.target.value : e.target.value)}
                />
              </div>
            )}
            {f.hint ? <p className="mt-1 text-[11.5px] leading-snug text-ink-600">{f.hint}</p> : null}
          </div>
        );
      })}
      {note ? <p className="text-[11.5px] leading-relaxed text-ink-600">{note}</p> : null}
      <button
        type="submit"
        disabled={state === 'busy'}
        className={`${danger ? 'border border-alert-error/40 bg-white text-alert-error hover:bg-alert-error/5' : 'btn-solid'} rounded-xs px-4 py-2 text-[11.5px] uppercase tracking-widest transition disabled:opacity-45 ${danger ? '' : ''}`}
      >
        {state === 'busy' ? 'Saving…' : submitLabel}
      </button>
    </form>
  );
}
