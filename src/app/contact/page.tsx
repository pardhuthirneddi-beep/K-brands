import type { Metadata } from 'next';
import { ensureDb } from '@/lib/bootstrap.ts';
import { settingsForUi } from '@/domain/settings.ts';
import { ReviewBadge } from '@/components/ui/badge.tsx';
import { ContactForm } from '@/components/site/contact-form.tsx';

ensureDb();
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Contact us',
  description: 'Reach the K-brands team about an order, a product question or anything else.',
  alternates: { canonical: '/contact' },
};

export default async function ContactPage() {
  const s = settingsForUi();
  return (
    <div className="container grid gap-12 py-12 lg:grid-cols-[1fr_360px] lg:py-16">
      <div>
        <p className="eyebrow">Support</p>
        <h1 className="display-section mt-3">Contact the team</h1>
        <p className="mt-3 max-w-prose text-[14.5px] leading-relaxed text-ink-500">
          Tell us what happened and include your order number if you have one — it is the fastest way for us to find
          your record. Messages are stored against your order and replied to individually.
        </p>
        <ContactForm />
      </div>
      <aside className="h-fit space-y-4">
        <div className="card p-5">
          <h2 className="eyebrow mb-3">Direct contact</h2>
          {s.supportEmail || s.supportPhone ? (
            <address className="space-y-1.5 text-[13.5px] not-italic leading-relaxed text-ink-600">
              {s.supportEmail ? <p>Email: {s.supportEmail}</p> : null}
              {s.supportPhone ? <p>Phone: {s.supportPhone}</p> : null}
            </address>
          ) : (
            <>
              <ReviewBadge label="Contact details not yet published" />
              <p className="mt-2 text-[13px] leading-relaxed text-ink-500">
                The store owner has not supplied a support email or phone number for this build, so none is shown
                here — we will not publish a placeholder number for you to call. This form is the working channel: it
                reaches the team directly.
              </p>
            </>
          )}
        </div>
        <div className="card p-5">
          <h2 className="eyebrow mb-2">Before you write</h2>
          <ul className="space-y-2 text-[13px] leading-relaxed text-ink-500">
            <li>· Order status and tracking live on your <a href="/account/orders" className="underline underline-offset-4">orders page</a>.</li>
            <li>· Returns and cancellations can be raised from the order itself.</li>
            <li>· Sizing questions are answered by the <a href="/size-guide" className="underline underline-offset-4">size guide</a>.</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}
