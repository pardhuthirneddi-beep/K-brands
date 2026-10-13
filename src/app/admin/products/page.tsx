import Link from 'next/link';
import { ensureDb } from '@/lib/bootstrap.ts';
import { listProducts } from '@/domain/catalog.ts';
import { Panel, Table } from '@/components/admin/panel.tsx';
import { Badge, SampleBadge } from '@/components/ui/badge.tsx';
import { FieldForm } from '@/components/admin/field-form.tsx';
import { formatMoney } from '@/domain/money.ts';

import { requireAdminPage } from '@/lib/session.ts';
ensureDb();
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Products' };

export default async function AdminProductsPage({
  searchParams,
}
: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  await requireAdminPage();
  const sp = await searchParams;
  const q = (sp.q ?? '').trim() || null;
  const status = sp.status && ['draft', 'published', 'archived', 'out_of_stock'].includes(sp.status) ? sp.status : null;
  const { items, total } = listProducts({ search: q, admin: true, includeSamples: true, perPage: 60, sort: 'newest' });
  const rows = status ? items.filter((p) => p.status === status) : items;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Catalogue</p>
          <h1 className="font-display text-[27px] leading-tight">Products</h1>
          <p className="mt-1 text-[12.5px] text-ink-600">
            {total.toLocaleString('en-IN')} records · every sample record is marked, and the storefront shows that mark to visitors too.
          </p>
        </div>
        <Link href="/admin/products/new" className="btn-solid py-2 text-[11.5px]">
          New record
        </Link>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <form method="GET" className="flex items-center gap-2" action="/admin/products">
          <label className="sr-only" htmlFor="q">Search products</label>
          <input id="q" name="q" defaultValue={q ?? ''} placeholder="Title or SKU" className="field max-w-[260px]" />
          <button type="submit" className="btn-outline py-2 text-[11.5px]">Search</button>
        </form>
        {['', 'draft', 'published', 'out_of_stock', 'archived'].map((s) => (
          <Link
            key={s || 'all'}
            href={s ? `/admin/products?status=${s}${q ? `&q=${encodeURIComponent(q)}` : ''}` : `/admin/products${q ? `?q=${encodeURIComponent(q)}` : ''}`}
            className={`rounded-xs border px-2.5 py-1 text-[11.5px] uppercase tracking-widest transition ${
              (status ?? '') === s ? 'border-ink bg-ink text-ivory-100' : 'border-stone-300 bg-white text-ink-500 hover:border-ink-300'
            }`}
          >
            {s || 'All'}
          </Link>
        ))}
      </div>

      <Panel title={`${rows.length} record${rows.length === 1 ? '' : 's'}`}>
        {rows.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-ink-600">
            Nothing here yet. Run <code className="text-ink-600">npm run db:seed-demo</code> for sample records, or create one.
          </p>
        ) : (
          <Table head={['Product', 'Status', 'Price', 'Variants', 'Availability', 'Actions']}>
            {rows.map((p) => (
              <tr key={p.id} className="align-top">
                <td className="py-2.5 pr-4">
                  <Link href={`/admin/products/${p.slug}`} className="font-medium underline-offset-4 hover:underline">
                    {p.title}
                  </Link>
                  <span className="mt-0.5 block text-[11.5px] text-ink-600">
                    /{p.slug} · {p.category_slug ?? 'uncategorised'}
                  </span>
                  {p.is_sample === 1 ? (
                    <span className="mt-1 inline-block">
                      <SampleBadge note={p.sample_note} />
                    </span>
                  ) : null}
                </td>
                <td className="py-2.5 pr-4">
                  <Badge tone={p.status === 'published' ? 'ok' : p.status === 'archived' ? 'neutral' : 'warn'}>{p.status}</Badge>
                </td>
                <td className="py-2.5 pr-4 tabular-nums">{formatMoney(p.price_cents, p.currency)}</td>
                <td className="py-2.5 pr-4 tabular-nums">{p.variantCount}</td>
                <td className="py-2.5 pr-4 tabular-nums">{p.availableUnits} available</td>
                <td className="py-2.5 pr-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/admin/products/${p.slug}`} className="text-[12px] underline underline-offset-4">
                      Manage
                    </Link>
                    {p.status !== 'published' ? (
                      <FieldForm
                        path="/api/admin/products"
                        method="PUT"
                        submitLabel="Publish"
                        confirm="Publish this record to the storefront?"
                        fields={[
                          { name: 'slug', type: 'hidden', value: p.slug },
                          { name: 'status', type: 'hidden', value: 'published' },
                        ]}
                      />
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>
    </div>
  );
}
