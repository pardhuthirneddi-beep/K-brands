import Link from 'next/link';
import { ensureDb } from '@/lib/bootstrap.ts';
import { CartView } from '@/components/cart/cart-view.tsx';
import { EmptyState } from '@/components/ui/states.tsx';
import { readCartKey, readUser } from '@/lib/session.ts';

ensureDb();
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Your bag',
  description: 'Review the items in your K-brands bag before checkout.',
  robots: { index: false, follow: false },
};

export default async function CartPage() {
  const user = await readUser();
  const cartKey = await readCartKey(user);
  return (
    <div className="container py-10 lg:py-14">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-stone-200 pb-5">
        <div>
          <p className="eyebrow">Step 1 of 3</p>
          <h1 className="display-section mt-2">Your bag</h1>
        </div>
        <Link href="/shop" className="text-[12px] tracking-label text-ink-500 underline-offset-4 hover:text-ink hover:underline">
          Continue shopping
        </Link>
      </header>
      <div className="grid gap-10 lg:grid-cols-[1.5fr_0.85fr]">
        <div>{cartKey ? <CartView variant="page" /> : <BagEmpty />}</div>
        <aside className="space-y-4 lg:pt-1">
          <div className="card p-5">
            <h2 className="eyebrow mb-2">How checkout works here</h2>
            <ol className="space-y-2 text-[13px] leading-relaxed text-ink-500">
              <li>1. Prices, discounts, delivery and tax are recalculated on our server at every step.</li>
              <li>2. Stock is held for a short window while you check out, so a style cannot be sold twice.</li>
              <li>3. Payment is confirmed by the provider on our server — never by the browser alone.</li>
            </ol>
          </div>
          <div className="border border-dashed border-sand-500/60 bg-sand-100/60 p-5 text-[12.5px] leading-relaxed text-ink-600">
            This deployment has no payment provider connected and its catalogue is largely sample data. Checkout is
            safe to test and will never take real money.
          </div>
        </aside>
      </div>
    </div>
  );
}

function BagEmpty() {
  return (
    <EmptyState
      title="Your bag is empty"
      body="Once you add something, it stays here — including between visits on this device — so you can come back to it."
      action={{ href: '/shop', label: 'Browse the range' }}
    />
  );
}
