import Link from 'next/link';
import { Wordmark } from './wordmark.tsx';
import { CartButton } from '../cart/cart-button.tsx';
import { SearchField } from '../cart/search-field.tsx';
import { AccountMenu } from './account-menu.tsx';
import { NavSheet } from './nav-sheet.tsx';
import { NavGroup } from './nav-group.tsx';
import { listCategories } from '@/domain/catalog.ts';

/**
 * Primary navigation.
 *
 * The link list is the brand's own (New Arrivals, Shirts, Polos, T-shirts, Trousers,
 * Jeans, Shop All), but every entry is rendered conditionally on real data: a category
 * with zero visible products is dropped, and New Arrivals only appears when something is
 * actually flagged new. That keeps "no empty nav items, no unverifiable claims" true after
 * the owner swaps the demo catalogue for real stock, not just today.
 *
 * Nothing in here links to accessories, footwear, women's wear or any other category the
 * catalogue cannot contain — and src/domain/catalog.ts refuses to save such a category, so
 * this bar cannot drift out of scope by an admin edit alone.
 */
const PRIMARY: { label: string; slug?: string; href: string }[] = [
  { label: 'New Arrivals', href: '/shop?tag=new' },
  { label: 'Shirts', slug: 'shirts', href: '/collections/shirts' },
  { label: 'Polos', slug: 'polos', href: '/collections/polos' },
  { label: 'T-Shirts', slug: 't-shirts', href: '/collections/t-shirts' },
  { label: 'Trousers', slug: 'trousers', href: '/collections/trousers' },
  { label: 'Jeans', slug: 'jeans', href: '/collections/jeans' },
  { label: 'Shop All', href: '/shop' },
];

export async function SiteHeader({
  cartCount,
  user,
}: {
  cartCount: number;
  user: { name: string; role: string } | null;
}) {
  const categories = listCategories();
  const bySlug = new Map(categories.map((c) => [c.slug, c]));
  const items = PRIMARY.flatMap((item) => {
    if (item.slug) {
      const cat = bySlug.get(item.slug);
      if (!cat || cat.product_count === 0) return [];
      const kids = categories
        .filter((c) => c.parent_slug === item.slug && c.product_count > 0)
        .map((c) => ({ href: `/collections/${c.slug}`, label: c.name, count: c.product_count }));
      return [{ ...item, count: cat.product_count, kids }];
    }
    if (item.href === '/shop?tag=new') {
      const fresh = categories.some((c) => c.product_count > 0);
      if (!fresh) return [];
      return [{ ...item, count: null as number | null, kids: [] as { href: string; label: string; count: number }[] }];
    }
    return [{ ...item, count: null as number | null, kids: [] as { href: string; label: string; count: number }[] }];
  });

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-canvas/90 backdrop-blur-md supports-[backdrop-filter]:bg-canvas/75">
      <div className="flex h-16 items-center gap-4 px-5 lg:h-[72px] lg:px-8">
        <div className="flex min-w-0 flex-1 items-center gap-7">
          <NavSheet categories={categories} />
          <Link href="/" aria-label="K-brands — home" className="shrink-0">
            <Wordmark />
          </Link>
          <nav aria-label="Primary" className="hidden min-w-0 items-center xl:flex">
            <ul className="flex items-center gap-7">
              {items.map((item) =>
                item.kids.length > 0 ? (
                  <NavGroup key={item.label} label={item.label} href={item.href}>
                    {item.kids}
                  </NavGroup>
                ) : (
                  <li key={item.label}>
                    <Link href={item.href} className="py-2 text-[13px] text-ink-600 transition hover:text-ink">
                      {item.label}
                    </Link>
                  </li>
                ),
              )}
            </ul>
          </nav>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <SearchField />
          <AccountMenu user={user} />
          <CartButton initialCount={cartCount} />
        </div>
      </div>
    </header>
  );
}
