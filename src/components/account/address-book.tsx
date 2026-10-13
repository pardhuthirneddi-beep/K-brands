'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCart } from '../providers.tsx';
import { INDIAN_STATES } from '@/domain/constants.ts';

export type Address = {
  id: number;
  label: string;
  recipient_name: string;
  phone: string;
  line1: string;
  line2: string | null;
  locality: string | null;
  city: string;
  state_name: string;
  state_code: string;
  pincode: string;
  country_code: string;
  is_default_shipping: number;
};

const BLANK = {
  recipientName: '',
  phone: '',
  line1: '',
  line2: '',
  locality: '',
  city: '',
  stateCode: 'MH',
  pincode: '',
  countryCode: 'IN',
};

type FormState = typeof BLANK;

async function send(path: string, method: string, body?: Record<string, unknown>) {
  const csrf = document.cookie.match(/kb_csrf=([^;]+)/)?.[1] ?? '';
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf },
    credentials: 'same-origin',
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  const data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!res.ok) throw new Error((data.error as string) ?? 'Request failed');
  return data;
}

export function AddressBook({ initial }: { initial: Address[] }) {
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [form, setForm] = useState<FormState>(BLANK);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const { toast } = useCart();
  const router = useRouter();

  function start(a?: Address) {
    setEditing(a ? a.id : 'new');
    setForm(
      a
        ? {
            recipientName: a.recipient_name,
            phone: a.phone,
            line1: a.line1,
            line2: a.line2 ?? '',
            locality: a.locality ?? '',
            city: a.city,
            stateCode: a.state_code,
            pincode: a.pincode,
            countryCode: a.country_code,
          }
        : { ...BLANK },
    );
    setErrors({});
  }

  async function save() {
    setBusy(true);
    setErrors({});
    try {
      await send('/api/account/addresses', 'POST', {
        ...form,
        id: editing === 'new' ? undefined : editing,
        setDefault: initial.length === 0,
      });
      toast('Address saved', 'ok');
      setEditing(null);
      router.refresh();
    } catch (e) {
      setErrors({ form: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    setBusy(true);
    try {
      await send(`/api/account/addresses?id=${String(id)}`, 'DELETE');
      router.refresh();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function makeDefault(a: Address) {
    setBusy(true);
    try {
      await send('/api/account/addresses', 'POST', {
        id: a.id,
        setDefault: true,
        recipientName: a.recipient_name,
        phone: a.phone,
        line1: a.line1,
        line2: a.line2,
        locality: a.locality,
        city: a.city,
        stateCode: a.state_code,
        pincode: a.pincode,
        countryCode: a.country_code,
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {errors.form ? (
        <p role="alert" className="text-[13px] text-alert-error">
          {errors.form}
        </p>
      ) : null}
      <ul className="grid gap-3 sm:grid-cols-2">
        {initial.map((a) => (
          <li key={a.id} className="card p-4">
            <p className="eyebrow">
              {a.label}
              {a.is_default_shipping === 1 ? ' · default' : ''}
            </p>
            <address className="mt-1.5 text-[13.5px] not-italic leading-relaxed text-ink-700">
              {a.recipient_name}
              <br />
              {a.line1}
              {a.line2 ? `, ${a.line2}` : ''}
              <br />
              {a.locality ? `${a.locality}, ` : ''}
              {a.city}, {a.state_name} {a.pincode}
            </address>
            <p className="mt-1 text-[12px] text-ink-400">{a.phone}</p>
            <div className="mt-3 flex flex-wrap gap-3 text-[12px] uppercase tracking-widest">
              <button type="button" onClick={() => start(a)} className="text-ink-500 underline-offset-4 hover:underline">
                Edit
              </button>
              {a.is_default_shipping !== 1 ? (
                <button type="button" onClick={() => makeDefault(a)} className="text-ink-500 underline-offset-4 hover:underline">
                  Make default
                </button>
              ) : null}
              <button type="button" onClick={() => remove(a.id)} className="text-alert-error underline-offset-4 hover:underline">
                Remove
              </button>
            </div>
          </li>
        ))}
        {initial.length === 0 && editing === null ? (
          <li className="card p-5 text-[13.5px] leading-relaxed text-ink-500 sm:col-span-2">
            No saved addresses yet. Add one and checkout will fill itself in next time.
          </li>
        ) : null}
      </ul>

      {editing !== null ? (
        <div className="card p-5">
          <h2 className="eyebrow mb-4">{editing === 'new' ? 'Add an address' : 'Edit address'}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input id="ab-name" label="Full name" value={form.recipientName} onChange={(v) => setForm((f) => ({ ...f, recipientName: v }))} error={errors.recipientName} />
            <Input
              id="ab-phone"
              label="Mobile"
              value={form.phone}
              inputMode="numeric"
              onChange={(v) => setForm((f) => ({ ...f, phone: v.replace(/\D/g, '').slice(0, 10) }))}
              error={errors.phone}
            />
            <div className="sm:col-span-2">
              <Input id="ab-l1" label="Flat / house no., building, street" value={form.line1} onChange={(v) => setForm((f) => ({ ...f, line1: v }))} error={errors.line1} />
            </div>
            <Input id="ab-l2" label="Area, landmark (optional)" value={form.line2} onChange={(v) => setForm((f) => ({ ...f, line2: v }))} />
            <Input id="ab-loc" label="Locality (optional)" value={form.locality} onChange={(v) => setForm((f) => ({ ...f, locality: v }))} />
            <Input id="ab-city" label="City / district" value={form.city} onChange={(v) => setForm((f) => ({ ...f, city: v }))} error={errors.city} />
            <div>
              <label className="label" htmlFor="ab-state">
                State
              </label>
              <select id="ab-state" className="field" value={form.stateCode} onChange={(e) => setForm((f) => ({ ...f, stateCode: e.target.value }))}>
                {INDIAN_STATES.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <Input
              id="ab-pin"
              label="PIN code"
              value={form.pincode}
              inputMode="numeric"
              onChange={(v) => setForm((f) => ({ ...f, pincode: v.replace(/\D/g, '').slice(0, 6) }))}
              error={errors.pincode}
            />
          </div>
          <p className="mt-3 text-[12px] leading-relaxed text-ink-400">
            Only India addresses are accepted while the store is India-first.
          </p>
          <div className="mt-4 flex gap-2.5">
            <button type="button" className="btn-solid py-2 text-[11.5px]" onClick={save} disabled={busy}>
              {busy ? 'Saving…' : 'Save address'}
            </button>
            <button type="button" className="btn-quiet py-2 text-[11.5px]" onClick={() => setEditing(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="btn-outline py-2 text-[11.5px]" onClick={() => start()}>
          Add a new address
        </button>
      )}
    </div>
  );
}

function Input({
  id,
  label,
  value,
  onChange,
  error,
  inputMode,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  inputMode?: string;
}) {
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="field"
        value={value}
        inputMode={inputMode as never}
        aria-invalid={error ? true : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      {error ? <p className="mt-1 text-[12px] text-alert-error">{error}</p> : null}
    </div>
  );
}
