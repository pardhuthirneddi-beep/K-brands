'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export type ProductFormValues = {
  slug: string;
  title: string;
  subtitle: string;
  description: string;
  priceCents: string;
  compareAtCents: string;
  categorySlug: string;
  garmentType: string;
  fabric: string;
  fit: string;
  status: 'draft' | 'published' | 'archived' | 'out_of_stock';
  isSample: boolean;
  taxBps: string;
};

const BLANK: ProductFormValues = {
  slug: '',
  title: '',
  subtitle: '',
  description: '',
  priceCents: '',
  compareAtCents: '',
  categorySlug: '',
  garmentType: '',
  fabric: '',
  fit: '',
  status: 'draft',
  isSample: true,
  taxBps: '0',
};

/**
 * Create/update a catalogue record. `isSample` is on by default: an unreviewed record
 * must not silently become live merchandising. Publishing a sample to a real store is
 * refused by the API, and that refusal is surfaced here rather than hidden.
 */
export function ProductForm({ initial, categories }: { initial?: Partial<ProductFormValues>; categories: string[] }) {
  const router = useRouter();
  const [v, setV] = useState<ProductFormValues>({ ...BLANK, ...initial });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  function set<K extends keyof ProductFormValues>(k: K, val: ProductFormValues[K]) {
    setV((prev) => ({ ...prev, [k]: val }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setMessage(null);
    try {
      const csrf = document.cookie.match(/kb_csrf=([^;]+)/)?.[1] ?? '';
      const res = await fetch('/api/admin/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf },
        credentials: 'same-origin',
        body: JSON.stringify({
          slug: v.slug,
          title: v.title,
          subtitle: v.subtitle || null,
          description: v.description || null,
          priceCents: Number(v.priceCents || 0),
          compareAtCents: v.compareAtCents ? Number(v.compareAtCents) : null,
          categorySlug: v.categorySlug || null,
          garmentType: v.garmentType || null,
          fabric: v.fabric || null,
          fit: v.fit || null,
          status: v.status,
          isSample: v.isSample,
          taxBps: Number(v.taxBps || 0),
        }),
      });
      const text = await res.text();
      const data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
      if (!res.ok) {
        setErrors((data.fieldErrors as Record<string, string>) ?? {});
        setMessage({ tone: 'error', text: (data.error as string) ?? 'The record was not saved.' });
        return;
      }
      setMessage({ tone: 'ok', text: `Saved ${v.slug}.` });
      router.refresh();
    } catch {
      setMessage({ tone: 'error', text: 'The request did not complete. Nothing was saved.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {message ? (
        <p
          role={message.tone === 'error' ? 'alert' : 'status'}
          className={`border px-4 py-2.5 text-[12.5px] leading-relaxed ${
            message.tone === 'error' ? 'border-alert-error/30 bg-alert-error/5 text-alert-error' : 'border-alert-ok/30 bg-alert-ok/5 text-alert-ok'
          }`}
        >
          {message.text}
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Text id="title" label="Title" value={v.title} error={errors.title} onChange={(x) => set('title', x)} required />
        <Text
          id="slug"
          label="URL slug"
          value={v.slug}
          error={errors.slug}
          hint={initial?.slug ? 'Changing the slug creates a new record; the old URL keeps working until you archive it.' : 'lowercase-hyphens'}
          onChange={(x) => set('slug', x.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
          required
        />
        <Text id="subtitle" label="Subtitle" value={v.subtitle} error={errors.subtitle} onChange={(x) => set('subtitle', x)} />
        <div>
          <label className="label" htmlFor="categorySlug">Category</label>
          <select id="categorySlug" className="field" value={v.categorySlug} onChange={(e) => set('categorySlug', e.target.value)}>
            <option value="">Uncategorised</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <Text id="fabric" label="Fabric" value={v.fabric} error={errors.fabric} onChange={(x) => set('fabric', x)} />
        <Text id="fit" label="Fit" value={v.fit} error={errors.fit} onChange={(x) => set('fit', x)} />
        <Text id="garmentType" label="Garment type" value={v.garmentType} error={errors.garmentType} onChange={(x) => set('garmentType', x)} />
        <Text id="taxBps" label="Tax (basis points)" type="number" value={v.taxBps} error={errors.taxBps} hint="0 = tax not configured; the storefront then says so instead of inventing a rate." onChange={(x) => set('taxBps', x)} />
        <Text id="priceCents" label="Price (paise)" type="number" value={v.priceCents} error={errors.priceCents} hint="₹4,990 = 499000" onChange={(x) => set('priceCents', x)} required />
        <Text id="compareAtCents" label="Compare-at price (paise)" type="number" value={v.compareAtCents} error={errors.compareAtCents} onChange={(x) => set('compareAtCents', x)} />
        <div>
          <label className="label" htmlFor="status">Status</label>
          <select id="status" className="field" value={v.status} onChange={(e) => set('status', e.target.value as ProductFormValues['status'])}>
            <option value="draft">draft — hidden from the store</option>
            <option value="published">published — visible in the store</option>
            <option value="out_of_stock">out of stock</option>
            <option value="archived">archived</option>
          </select>
        </div>
        <label className="flex items-start gap-2 pt-6 text-[13px] leading-snug text-ink-600">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-ink" checked={v.isSample} onChange={(e) => set('isSample', e.target.checked)} />
          <span>
            Sample / placeholder record
            <span className="block text-[11.5px] text-ink-600">
              Keeps it visibly marked in the storefront and blocks it from being published to a live store.
            </span>
          </span>
        </label>
      </div>
      <div>
        <label className="label" htmlFor="description">Description</label>
        <textarea id="description" rows={6} className="field resize-y" value={v.description} onChange={(e) => set('description', e.target.value)} />
        {errors.description ? <p className="mt-1 text-[12px] text-alert-error">{errors.description}</p> : null}
      </div>
      <button type="submit" disabled={busy} className="btn-solid py-2.5 text-[11.5px] disabled:opacity-45">
        {busy ? 'Saving…' : initial?.slug ? 'Save changes' : 'Create record'}
      </button>
    </form>
  );
}

function Text({
  id,
  label,
  value,
  onChange,
  error,
  hint,
  type = 'text',
  required,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  hint?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <input id={id} type={type} className="field" value={value} required={required} onChange={(e) => onChange(e.target.value)} />
      {error ? <p className="mt-1 text-[12px] text-alert-error">{error}</p> : hint ? <p className="mt-1 text-[11.5px] text-ink-600">{hint}</p> : null}
    </div>
  );
}
