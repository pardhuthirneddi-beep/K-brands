import type { Metadata } from 'next';
import Link from 'next/link';
import { ensureDb } from '@/lib/bootstrap.ts';
import { settingsForUi } from '@/domain/settings.ts';
import { formatMoney } from '@/domain/money.ts';

ensureDb();
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Help & FAQs',
  description: 'Answers about sizing, delivery, returns, payment and this store’s current build status.',
  alternates: { canonical: '/faq' },
};

export default async function FaqPage() {
  const s = settingsForUi();
  const groups: { group: string; items: { q: string; a: string }[] }[] = [
    {
      group: 'Products & sizing',
      items: [
        {
          q: 'How do I choose the right size?',
          a: 'Every product page links to the measurement table for that garment type — tops and bottoms are sized differently on purpose. Compare a garment you already own, laid flat, against those numbers rather than guessing from S/M/L.',
        },
        {
          q: 'Are the photographs real product shots?',
          a: 'In this build, no. The catalogue is a labelled set of development samples and the artwork is illustration, not photography of stocked garments. It exists so the storefront can be built and tested before final product imagery exists.',
        },
        {
          q: 'Do colours look exactly like the screen?',
          a: 'Fabric colour shifts with light and between dye lots. We publish the colour name and swatch, and will add “as seen on” photography once real product imagery is approved.',
        },
      ],
    },
    {
      group: 'Orders & payment',
      items: [
        {
          q: 'Can I pay with card or UPI?',
          a: 'Not yet. No payment provider has been connected to this store, so a real card, UPI or net-banking charge cannot be taken. The checkout is fully functional against a test adapter so the journey can be verified, and it is always labelled as a test.',
        },
        {
          q: 'Is cash on delivery available?',
          a: s.codEnabled
            ? 'COD is enabled for eligible PIN codes; any handling fee is shown before you confirm.'
            : 'No. COD stays off until the owner approves it and the courier confirms support for your destination — we will not offer it on assumption.',
        },
        {
          q: 'What happens if my payment fails?',
          a: 'Your stock hold survives for a short window and the order stays marked unpaid, so you can retry. We only ever mark an order paid when the payment provider confirms it to our servers — a browser redirect on its own does nothing.',
        },
        {
          q: 'Will I be charged twice if I click Place order twice?',
          a: 'No. Each checkout carries an idempotency key, so a double click, a retry or a refresh-after-post returns your original order instead of creating a second one.',
        },
      ],
    },
    {
      group: 'Delivery',
      items: [
        {
          q: 'Where do you ship?',
          a: 'India only at this stage. International destinations stay closed until courier coverage, duties and returns support are confirmed country by country.',
        },
        {
          q: 'What will delivery cost, and how long?',
          a:
            s.shippingMode === 'unconfigured'
              ? 'Neither figure is published yet, because no courier arrangement exists. Rather than invent a fee or a promise of days, checkout stays closed until the owner configures it.'
              : `Standard delivery is charged per the configured store rules and is always recalculated on our server before you confirm.`,
        },
        {
          q: 'How do I track my order?',
          a: 'From the order page or the link in your dispatch email. If the store has no live courier connected, no tracking number is shown at all — we will never display a fake one.',
        },
      ],
    },
    {
      group: 'Returns, exchanges & refunds',
      items: [
        {
          q: 'Can I return something?',
          a: s.returnsEnabled
            ? `Returns are available within ${s.returnWindowDays ?? 'the published'} window from the trigger stated in the returns policy.`
            : 'The returns policy has not been approved for this store yet, so no window is promised. You can still raise a request from your order page and we will review it manually — the button exists precisely so nothing is silently refused.',
        },
        {
          q: 'Can I exchange for another size?',
          a: s.exchangeEnabled
            ? 'Yes — exchanges are supported where the replacement is in stock, and the return and replacement are tracked separately.'
            : 'Exchanges are not enabled yet. Until they are, the reliable route is to raise a return and place a new order.',
        },
        {
          q: 'Does requesting a return refund me automatically?',
          a: 'No, deliberately. A request is recorded; then review; then receipt and inspection; then an approved refund; then the refund being issued by the payment provider. Each step is separate and visible on your request.',
        },
      ],
    },
    {
      group: 'Your account & data',
      items: [
        {
          q: 'Do I need an account to order?',
          a: 'No — you can check out as a guest and open the order link we email you. An account adds saved addresses, order history and self-service requests.',
        },
        {
          q: 'What do you store about me?',
          a: 'Your email, name, optional phone, saved addresses, orders and payment status. Passwords are stored only as a salted scrypt hash, card details are never stored, and audit records keep a salted fingerprint of an IP rather than the IP itself.',
        },
        {
          q: 'How do I delete my account?',
          a: 'Use the contact page. Self-service deletion is not built yet, and financial records we are required to retain will be kept even after your profile is removed — we would rather tell you that than promise a clean delete we cannot fully perform.',
        },
      ],
    },
  ];

  return (
    <div className="container max-w-3xl py-12 lg:py-16">
      <header className="border-b border-stone-200 pb-6">
        <p className="eyebrow">Support</p>
        <h1 className="display-section mt-3">Help &amp; FAQs</h1>
        <p className="mt-3 text-[14.5px] leading-relaxed text-ink-500">
          Answers are written from how this store is actually configured, so nothing here over-promises.{' '}
          <Link href="/contact" className="text-ink underline underline-offset-4">Ask us directly</Link> if your
          question is not covered.
        </p>
      </header>
      <div className="mt-9 space-y-10">
        {groups.map((g) => (
          <section key={g.group}>
            <h2 className="display-section mb-4 text-[24px]">{g.group}</h2>
            <dl className="divide-y divide-stone-200 border-y border-stone-200">
              {g.items.map((item) => (
                <div key={item.q} className="py-4">
                  <dt className="font-display text-[16.5px] leading-snug">{item.q}</dt>
                  <dd className="mt-1.5 text-[14px] leading-relaxed text-ink-500">{item.a}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
      <section className="mt-10 card p-6">
        <h2 className="display-section text-[22px]">Ordering for a specific date?</h2>
        <p className="mt-2 text-[14px] leading-relaxed text-ink-500">
          Tell us the date and the city in your order note and we will confirm feasibility before dispatch. Delivery
          estimates only exist once a courier is configured — until then we would rather check manually than quote a
          promise we cannot keep. Prices start at {formatMoney(145000, s.currency)}.
        </p>
        <Link href="/contact" className="btn-outline mt-4 inline-flex">
          Contact the team
        </Link>
      </section>
    </div>
  );
}
