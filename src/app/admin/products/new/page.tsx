import { ensureDb } from '@/lib/bootstrap.ts';
import { listCategories } from '@/domain/catalog.ts';
import { ProductForm } from '@/components/admin/product-form.tsx';
import { Panel } from '@/components/admin/panel.tsx';

import { requireAdminPage } from '@/lib/session.ts';
ensureDb();
export const dynamic = 'force-dynamic';

export const metadata = { title: 'New product' };

export default async function NewProductPage() {
  await requireAdminPage();
  const categories = listCategories({ includeSamples: true }).map((c) => c.slug);
  return (
    <div className="max-w-3xl space-y-5">
      <header>
        <p className="eyebrow">Catalogue</p>
        <h1 className="font-display text-[27px] leading-tight">New product record</h1>
      </header>
      <Panel
        title="Details"
        note="Leave “sample record” on until the copy, pricing and photography have been approved by the owner. A sample record can never be published into a live store."
      >
        <ProductForm categories={categories} />
      </Panel>
      <p className="text-[12px] leading-relaxed text-ink-400">
        Sizes, colours, SKUs and stock live on variants — add them on the product page after saving, or use{' '}
        <code className="text-ink-600">npm run db:seed-demo</code> for a full sample grid.
      </p>
    </div>
  );
}

