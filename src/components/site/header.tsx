import Link from 'next/link';
import { Wordmark } from './wordmark.tsx';
import { CartButton } from '../cart/cart-button.tsx';
import { SearchField } from '../cart/search-field.tsx';
import { AccountMenu } from './account-menu.tsx';
import { listCategories } from '@/domain/catalog.ts';
import { NavSheet } from './nav-sheet.tsx';

export async function SiteHeader({
  cartCount,
  user,
}: {
  cartCount: number;
  user: { name: string; role: string } | null;
}) {
  const categories = listCategories().slice(0, 6);
  return (
    <header className="sticky top-0 z-50 border-b border-stone-200 bg-ivory/85 backdrop-blur-md supports-[backdrop-filter]:bg-ivory/75">
      <div className="flex h-[62px] items-center gap-3 px-5 lg:h-[70px] lg:px-8">
        <div className="flex flex-1 items-center gap-6">
          <NavSheet categories={categories.map((c) => ({ slug: c.slug, name: c.name }))} />
          <Link href="/" aria-label="K-brands — home" className="shrink-0">
            <Wordmark />
          </Link>
          <nav aria-label="Primary" className="hidden items-center gap-5 lg:flex">
            <Link
              href="/shop"
              className="link-underline text-[12px] tracking-label text-ink-600 hover:text-ink"
            >
              Shop all
            </Link>
            {categories.map((c) => (
              <Link
                key={c.slug}
                href={`/collections/${c.slug}`}
                className="link-underline text-[12px] tracking-label text-ink-600 hover:text-ink"
              >
                {c.name}
              </Link>
            ))}
            <Link href="/about" className="link-underline text-[12px] tracking-label text-ink-600 hover:text-ink">
              About
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-1.5">
          <SearchField />
          <AccountMenu user={user} />
          <CartButton initialCount={cartCount} />
        </div>
      </div>
    </header>
  );
}
