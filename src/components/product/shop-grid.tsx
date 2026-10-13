import { ProductCard } from './product-card.tsx';
import { EmptyState } from '../ui/states.tsx';
import type { CatalogProduct } from '@/domain/catalog.ts';

export function ShopGrid({ items, dense = false }: { items: CatalogProduct[]; dense?: boolean }) {
  if (items.length === 0) {
    return (
      <EmptyState
        title="Nothing matches those filters"
        body="Try removing a filter or two — the range is deliberately small right now, and some styles are held back until their details are verified."
        action={{ href: '/shop', label: 'Clear and browse all' }}
      />
    );
  }
  return (
    <div className={`grid grid-cols-2 gap-x-4 gap-y-10 ${dense ? 'md:grid-cols-4' : 'md:grid-cols-3 lg:grid-cols-4'}`}>
      {items.map((p, i) => (
        <ProductCard key={p.id} product={p} priority={i < 4} compact={dense} />
      ))}
    </div>
  );
}
