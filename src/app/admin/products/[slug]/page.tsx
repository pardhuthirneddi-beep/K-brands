import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ensureDb } from '@/lib/bootstrap.ts';
import { get } from '@/db/client.ts';
import { getProductBySlug, listCategories } from '@/domain/catalog.ts';
import { Panel, Table } from '@/components/admin/panel.tsx';
import { Badge, SampleBadge, ReviewBadge } from '@/components/ui/badge.tsx';
import { ProductForm } from '@/components/admin/product-form.tsx';
import { FieldForm } from '@/components/admin/field-form.tsx';
import { ActionButton } from '@/components/admin/action-button.tsx';
import { formatMoney } from '@/domain/money.ts';
import { SIZE_GUIDES } from '@/domain/size-guides.ts';

import { requireAdminPage } from '@/lib/session.ts';
ensureDb();
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  await requireAdminPage('/admin/products');
  const { slug } = await params;
  const row = get<{ title: string }>('SELECT title FROM products WHERE slug = ?', [decodeURIComponent(slug)]);
  if (!row) notFound();
  return { title: row.title };
}

export default async function AdminProductPage({ params }
: { params: Promise<{ slug: string }> }) {
  await requireAdminPage();
  const { slug } = await params;
  const p = getProductBySlug(decodeURIComponent(slug), { admin: true, includeSamples: true });
  if (!p) notFound();
  const categories = listCategories({ includeSamples: true }).map((c) => c.slug);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/admin/products" className="text-[12px] uppercase tracking-widest text-ink-400 hover:text-ink">
            ← Products
          </Link>
          <h1 className="mt-1 font-display text-[27px] leading-tight">{p.title}</h1>
          <p className="mt-1.5 flex flex-wrap items-center gap-2 text-[12.5px] text-ink-400">
            <Badge tone={p.status === 'published' ? 'ok' : p.status === 'archived' ? 'neutral' : 'warn'}>{p.status}</Badge>
            {p.is_sample === 1 ? <SampleBadge note={p.sample_note} /> : <Badge tone="ok">Verified record</Badge>}
            <span>/product/{p.slug}</span>
            {p.published_at ? <span>published {p.published_at.slice(0, 10)}</span> : <span>never published</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/product/${p.slug}`} className="btn-outline py-2 text-[11.5px]">
            View in store
          </Link>
          <ActionButton
            small
            tone="danger"
            label={p.status === 'archived' ? 'Already archived' : 'Archive / delete'}
            confirm="Archive this record? If any order references it, it is archived instead of deleted so history survives."
            path={`/api/admin/products?slug=${encodeURIComponent(p.slug)}`}
            method="DELETE"
          />
        </div>
      </header>

      {p.is_sample === 1 ? (
        <p className="border border-dashed border-sand-500/70 bg-sand-100/60 px-4 py-3 text-[12.5px] leading-relaxed text-ink-600">
          <strong className="font-semibold">Sample record.</strong> {p.sample_note ?? 'Placeholder content for development.'}{' '}
          Publishing it to a live store is refused by the API until the copy, pricing and photography are replaced with
          verified data.
        </p>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
        <Panel title="Product details">
          <ProductForm
            categories={categories}
            initial={{
              slug: p.slug,
              title: p.title,
              subtitle: p.subtitle ?? '',
              description: p.description ?? '',
              priceCents: String(p.price_cents),
              compareAtCents: p.compare_at_price_cents != null ? String(p.compare_at_price_cents) : '',
              categorySlug: p.category_slug ?? '',
              garmentType: p.garment_type ?? '',
              fabric: p.fabric ?? '',
              fit: p.fit ?? '',
              status: p.status,
              isSample: p.is_sample === 1,
              taxBps: String(p.tax_bps),
            }}
          />
        </Panel>

        <div className="space-y-4">
          <Panel
            title={`Variants (${p.variants.length})`}
            note={`${p.totalAvailable} unit${p.totalAvailable === 1 ? '' : 's'} available to sell across ${p.variants.filter((v) => v.status === 'active').length} active variant${p.variants.length === 1 ? '' : 's'}.`}
          >
            {p.variants.length === 0 ? (
              <p className="py-3 text-[13px] text-ink-400">No variants yet — the product cannot be added to a basket until one exists.</p>
            ) : (
              <Table head={['SKU', 'Size / colour', 'Price', 'On hand', 'Available', 'Status']}>
                {p.variants.map((v) => (
                  <tr key={v.id} className="align-top">
                    <td className="py-2 pr-4 font-mono text-[11.5px]">{v.sku}</td>
                    <td className="py-2 pr-4 text-[12.5px]">
                      {v.size ?? '—'}
                      {v.color_name ? <span className="block text-[11.5px] text-ink-400">{v.color_name}</span> : null}
                    </td>
                    <td className="py-2 pr-4 tabular-nums">{formatMoney(v.price_cents ?? p.price_cents, p.currency)}</td>
                    <td className="py-2 pr-4 tabular-nums">{v.stock_qty}</td>
                    <td className={`py-2 pr-4 tabular-nums ${v.available === 0 ? 'text-alert-error' : v.available <= 3 ? 'text-alert-warn' : ''}`}>
                      {v.available}
                      {v.reserved_qty > 0 ? <span className="block text-[11.5px] text-ink-400">{v.reserved_qty} in baskets</span> : null}
                    </td>
                    <td className="py-2 pr-4">
                      <Badge tone={v.status === 'active' ? 'ok' : 'neutral'}>{v.status}</Badge>
                    </td>
                  </tr>
                ))}
              </Table>
            )}
          </Panel>

          <Panel title="Adjust stock" note="Every movement is written to the inventory ledger with your user id and this note.">
            <FieldForm
              path="/api/admin/stock"
              submitLabel="Apply adjustment"
              fields={[
                { name: 'variantId', label: 'Variant id', type: 'number', required: true, hint: p.variants.map((v) => `${v.id} · ${v.sku}`).slice(0, 4).join('  |  ') },
                { name: 'delta', label: 'Change (use a negative number to remove)', type: 'number', required: true },
                { name: 'note', label: 'Reason', placeholder: 'Physical count, damaged unit, new stock in…' },
              ]}
            />
          </Panel>

          <Panel title="Add a variant">
            <FieldForm
              path="/api/admin/stock"
              submitLabel="Create variant"
              fields={[
                { name: 'productSlug', type: 'hidden', value: p.slug },
                { name: 'sku', label: 'SKU', required: true, hint: 'Must be unique across the store.' },
                { name: 'size', label: 'Size' },
                { name: 'colorName', label: 'Colour name' },
                { name: 'stockQty', label: 'Stock on hand', type: 'number', value: 0 },
                { name: 'priceCents', label: 'Price override (paise, optional)', type: 'number' },
                {
                  name: 'status',
                  label: 'Status',
                  type: 'select',
                  value: 'active',
                  options: [
                    { value: 'active', label: 'active — sellable' },
                    { value: 'inactive', label: 'inactive — hidden' },
                  ],
                },
              ]}
            />
          </Panel>

          <Panel title="Photography & size guide">
            <div className="space-y-3 text-[12.5px] leading-relaxed text-ink-500">
              <p>
                <strong className="text-ink">Images: {p.images.length}</strong>
                {p.images.length > 0 ? (
                  <span className="ml-2 text-ink-400">
                    {p.images.filter((i) => i.kind !== 'photo').length > 0 ? `${String(p.images.filter((i) => i.kind !== 'photo').length)} of them generated placeholders` : 'all uploaded photographs'}
                  </span>
                ) : (
                  <span className="ml-2 text-ink-400">— the storefront falls back to generated artwork labelled as sample art.</span>
                )}
              </p>
              <p className="border border-dashed border-stone-300 px-3 py-2 text-[12px] text-ink-500">
                There is no file upload in this build: images are served from <code className="text-ink-600">/media/**</code> on the same
                origin, so real photography means dropping files there (or pointing at the CDN) and inserting rows into{' '}
                <code className="text-ink-600">product_images</code>. Documented in docs/brand-assets.md.
              </p>
              <div>
                <p className="eyebrow mb-1">Size guide</p>
                {p.size_guide_key ? (
                  <p className="text-[12.5px] text-ink-600">
                    Using <code className="text-ink-600">{p.size_guide_key}</code>
                    {SIZE_GUIDES[p.size_guide_key] ? ` — “${SIZE_GUIDES[p.size_guide_key]!.title}”` : ' — key not found, the page will show a fallback'}
                    .
                  </p>
                ) : (
                  <p className="flex flex-wrap items-center gap-2">
                    <ReviewBadge label="No size guide linked" /> This product shows the generic guide until the owner publishes measurements.
                  </p>
                )}
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
