import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ensureDb } from '@/lib/bootstrap.ts';
import { readUser } from '@/lib/session.ts';
import { CheckoutForm } from '@/components/checkout/checkout-form.tsx';
import { paymentModeLabel } from '@/adapters/payment.ts';
import { getSetting } from '@/domain/settings.ts';
import * as env from '@/lib/env.ts';

ensureDb();
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Checkout',
  description: 'Complete your K-brands order.',
  robots: { index: false, follow: false },
};

export default async function CheckoutPage() {
  const user = await readUser();
  if (!env.liveCommerceEnabled && !env.sandboxOrdersEnabled) redirect('/cart');
  const mode = paymentModeLabel();
  const allowCod = env.codEnabled && getSetting<boolean>('cod.enabled', false);
  return (
    <div className="container py-10 lg:py-14">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-stone-200 pb-5">
        <div>
          <p className="eyebrow">Step 2 of 3</p>
          <h1 className="display-section mt-2">Checkout</h1>
        </div>
        <Link href="/cart" className="text-[12px] tracking-label text-ink-500 underline-offset-4 hover:text-ink hover:underline">
          Back to bag
        </Link>
      </header>

      {!user ? (
        <div className="mb-7 flex flex-wrap items-center justify-between gap-3 border border-stone-200 bg-white/60 px-4 py-3">
          <p className="text-[13px] leading-relaxed text-ink-600">
            Have an account? Signing in saves your addresses and lets you track this order later.
          </p>
          <span className="flex gap-4 text-[12px] tracking-label">
            <Link href="/account/login?next=/checkout" className="underline underline-offset-4">Sign in</Link>
            <Link href="/account/register" className="text-ink-600 underline underline-offset-4">Create one</Link>
          </span>
        </div>
      ) : null}

      <div
        className={`mb-8 border px-4 py-3 text-[12.5px] leading-relaxed ${
          mode.mode === 'live' ? 'border-alert-ok/35 bg-alert-ok/5 text-alert-ok' : 'border-sand-500/50 bg-sand-100/70 text-ink-600'
        }`}
        role="status"
      >
        <strong className="font-semibold">{mode.label}.</strong> {mode.detail}
        {mode.mode !== 'live' ? (
          <>
            {' '}No card details are collected and no money moves.{' '}
            <Link href="/faq" className="underline underline-offset-4">Why am I seeing this?</Link>
          </>
        ) : null}
      </div>

      <CheckoutForm initialEmail={user?.email ?? ''} initialPhone={(user?.phone ?? '').replace(/\D/g, '').slice(-10)} allowCod={allowCod} />
    </div>
  );
}
