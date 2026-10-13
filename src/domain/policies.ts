import { getSetting, requiresReview } from './settings.ts';
import { formatMoney } from './money.ts';

/**
 * Policy rendering is config-driven. Where a fact has not been approved by the
 * store owner (windows, fees, timelines, entity details) the page says so in
 * plain language instead of publishing an invented number, and the page is
 * flagged as awaiting review.
 */
export type PolicyDoc = { title: string; shortTitle: string; summary: string };

export const POLICIES: Record<string, PolicyDoc> = {
  shipping: {
    title: 'Shipping policy',
    shortTitle: 'Shipping',
    summary: 'Where we deliver, what it costs and how long it takes once those details are approved.',
  },
  returns: {
    title: 'Returns & exchanges',
    shortTitle: 'Returns',
    summary: 'How to send something back, what condition it must be in, and how a refund is reached.',
  },
  cancellation: {
    title: 'Cancellation policy',
    shortTitle: 'Cancellation',
    summary: 'When an order can still be stopped, and what happens to money already taken.',
  },
  refund: {
    title: 'Refund policy',
    shortTitle: 'Refunds',
    summary: 'How refunds are approved, issued and tracked back to you.',
  },
  privacy: {
    title: 'Privacy notice',
    shortTitle: 'Privacy',
    summary: 'What we collect, why we hold it, and how to exercise your choices.',
  },
  terms: {
    title: 'Terms of use & sale',
    shortTitle: 'Terms',
    summary: 'The agreement between you and K-brands when you browse and buy.',
  },
};

export type Section = { heading: string; paragraphs: string[]; status: 'configured' | 'pending' };

function dash(): string {
  return 'not configured yet';
}

export function renderPolicy(slug: string): { sections: Section[]; requiresReview: boolean } {
  const pending: Section['status'] = 'pending';
  switch (slug) {
    case 'shipping': {
      const mode = getSetting<string>('shipping.mode', 'unconfigured');
      const flat = getSetting<number | null>('shipping.flat_rate_cents', null);
      const free = getSetting<number | null>('shipping.free_threshold_cents', null);
      const configured = mode !== 'unconfigured' && flat != null;
      return {
        requiresReview: !configured || requiresReview('shipping.flat_rate_cents'),
        sections: [
          {
            heading: 'Where we deliver',
            status: 'configured',
            paragraphs: [
              'K-brands is launching India-first. Orders are currently limited to delivery addresses inside India; international destinations stay closed until courier coverage, duties and return logistics have been confirmed for each country.',
              'We do not deliver to PO boxes where a signature is required, because most couriers cannot complete those deliveries.',
            ],
          },
          {
            heading: 'What delivery costs',
            status: configured ? 'configured' : pending,
            paragraphs: configured
              ? [
                  `Standard delivery is ${formatMoney(Math.trunc(flat!), 'INR')}${
                    free != null ? ` and free on orders of ${formatMoney(Math.trunc(free), 'INR')} or more` : ''
                  }.`,
                ]
              : [
                  `Delivery charges are ${dash()}. Rather than guess a figure, we are holding checkout closed until the owner approves a rate — you will not be shown an invented shipping cost.`,
                ],
          },
          {
            heading: 'How long delivery takes',
            status: pending,
            paragraphs: [
              `Transit times are ${dash()}. We will publish realistic ranges per PIN-code zone once a courier contract exists, because a delivery promise made before that would be unreliable.`,
            ],
          },
          {
            heading: 'Tracking',
            status: 'configured',
            paragraphs: [
              'When a shipment is created you will receive the courier reference on the order page and by email. If a courier has not been configured for this store, no tracking number will ever be shown — we will not display a placeholder that looks like a real one.',
            ],
          },
        ],
      };
    }
    case 'returns': {
      const enabled = getSetting<boolean>('returns.enabled', false);
      const windowDays = getSetting<number | null>('returns.window_days', null);
      const timeline = getSetting<number | null>('returns.refund_timeline_days', null);
      const returnShipping = getSetting<string>('returns.return_shipping', 'customer_pays_unconfigured');
      const configured = enabled && windowDays != null && !requiresReview('returns.window_days');
      return {
        requiresReview: !configured,
        sections: [
          {
            heading: 'Whether returns are offered at all',
            status: configured ? 'configured' : pending,
            paragraphs: configured
              ? [`Yes. Items can be returned within ${String(windowDays)} day(s) of the approved trigger event.`]
              : [
                  `A return window is ${dash()}. The technical flow to raise, review, inspect and refund a return is built and tested, but the store has not approved the commercial promise yet — so this page states that rather than publishing a number of days we made up.`,
                  'Until it is approved, return requests raised from an order page are recorded for manual review and answered individually.',
                ],
          },
          {
            heading: 'Condition of returned goods',
            status: 'configured',
            paragraphs: [
              'Returned garments should be unworn and unwashed, with tags attached and packaging intact. Items marked as final sale and inner-wear categories may be excluded where lawful — the exclusion list is maintained by the store owner.',
              'Every return is inspected on arrival. The inspection result, the stock disposition and the refund decision are three separate steps, each recorded against your request.',
            ],
          },
          {
            heading: 'Who pays return shipping',
            status: returnShipping === 'customer_pays_unconfigured' ? pending : 'configured',
            paragraphs: [
              returnShipping === 'customer_pays_unconfigured'
                ? `Return postage arrangements are ${dash()}. We will confirm the arrangement before asking you to send anything back, so you are never out of pocket on an assumption.`
                : `Return postage: ${returnShipping.replace(/_/g, ' ')}.`,
            ],
          },
          {
            heading: 'Exchanges',
            status: getSetting<boolean>('returns.exchange_enabled', false) ? 'configured' : pending,
            paragraphs: [
              getSetting<boolean>('returns.exchange_enabled', false)
                ? 'Exchanges for another size or colour are supported where the replacement is in stock; the return and the replacement are tracked separately.'
                : `Exchanges are ${dash()} — no exchange is promised on this store until the owner enables the flow.`,
            ],
          },
          {
            heading: 'Refund timing',
            status: timeline != null ? 'configured' : pending,
            paragraphs:
              timeline != null
                ? [`Approved refunds are issued within ${String(timeline)} day(s) of the refund being approved, subject to your bank or UPI provider.`]
                : [`Refund turnaround is ${dash()}. Once a refund is issued we tell you immediately, because the time it takes to reach your account depends on your bank and not only on us.`],
          },
        ],
      };
    }
    case 'cancellation': {
      const window = getSetting<number | null>('cancellation.window_minutes', null);
      const afterShipment = getSetting<boolean>('cancellation.after_shipment', false);
      return {
        requiresReview: window == null || requiresReview('cancellation.window_minutes'),
        sections: [
          {
            heading: 'When you can cancel',
            status: window != null ? 'configured' : pending,
            paragraphs:
              window != null
                ? [`An order can be cancelled online within ${String(window)} minute(s) of being placed, before it is packed.`]
                : [`The cancellation window is ${dash()}. Until it is approved, the "Request cancellation" button records your request for our team instead of self-cancelling — that way we never refuse you based on a deadline we invented.`],
          },
          {
            heading: 'After an order is dispatched',
            status: afterShipment ? 'configured' : 'configured',
            paragraphs: [
              afterShipment
                ? 'Once a parcel has left us it cannot be cancelled, but it can be refused on delivery or returned under the returns policy.'
                : 'Once a parcel has left us it cannot be cancelled. Refusing the delivery or raising a return are the routes available, and both are recorded on your order.',
            ],
          },
          {
            heading: 'What happens to your money',
            status: 'configured',
            paragraphs: [
              'A cancellation cancels the order first and refunds second — these are separate states. If payment had been captured, the refund moves to "requested", then "approved", then "issued", and you can see each step on the order page.',
            ],
          },
        ],
      };
    }
    case 'refund': {
      const method = getSetting<string>('returns.refund_method', 'original_payment_mode');
      return {
        requiresReview: requiresReview('returns.refund_timeline_days'),
        sections: [
          {
            heading: 'Where money goes back to',
            status: 'configured',
            paragraphs: [
              method === 'original_payment_mode'
                ? 'Refunds are issued to the original payment method wherever the provider supports it. Cash-on-delivery orders are settled by the arrangement recorded on the order.'
                : `Refund method for this store: ${method.replace(/_/g, ' ')}.`,
              'We never send a refund to a different account than the one that paid, and we will not offer cash or third-party payout routes without the owner approving them.',
            ],
          },
          {
            heading: 'How long a refund takes',
            status: 'pending',
            paragraphs: [
              `The store's processing timeline is ${dash()}. After we issue a refund, the time it takes to appear depends on your bank or UPI app — typically a few working days, but we will not commit to a number the provider has not confirmed to us.`,
            ],
          },
          {
            heading: 'Partial refunds',
            status: 'configured',
            paragraphs: [
              'Multi-item orders can be refunded item by item. Delivery charges are handled per the approved policy; until that exists, we contact you before deciding, and the order shows as partially refunded.',
            ],
          },
          {
            heading: 'Disputes',
            status: 'configured',
            paragraphs: [
              'If you believe a refund is owed and has not arrived, reply to your order email with the order number. Every decision we make on your refund is written to an internal audit record we can both look at.',
            ],
          },
        ],
      };
    }
    case 'privacy': {
      const entity = getSetting<string | null>('store.legal_entity_name', null);
      return {
        requiresReview: requiresReview('policy.privacy_summary') || !entity,
        sections: [
          {
            heading: 'Who is responsible for your data',
            status: entity ? 'configured' : pending,
            paragraphs: entity
              ? [`${entity} operates this store and is responsible for the personal data described here.`]
              : [`The registered legal entity behind this store is ${dash()} and is being confirmed by the owner. This notice therefore describes the K-brands application's data handling, and will name the responsible entity before the store goes live.`],
          },
          {
            heading: 'What we collect',
            status: 'configured',
            paragraphs: [
              'Account: email address, name, optional phone number, and a salted password hash.',
              'Orders: delivery and billing details, the items bought, order totals and payment status.',
              'Security: session tokens (hashed), rate-limit counters and a salted, non-reversible fingerprint of the request IP for abuse control.',
              'We do not store card numbers, UPI PINs, CVVs or gateway secrets. Payment instrument data stays with the payment provider.',
            ],
          },
          {
            heading: 'What we deliberately do not keep',
            status: 'configured',
            paragraphs: [
              'Plain-text passwords, raw IP addresses in audit records, and any cookie used for cross-site advertising. There is no analytics or advertising pixel in this build.',
            ],
          },
          {
            heading: 'How long we keep things',
            status: 'pending',
            paragraphs: [
              `A formal retention schedule is ${dash()}. Operationally: order and payment records are kept for accounting purposes, sessions expire after 14 days, and password-reset links expire in 45 minutes.`,
            ],
          },
          {
            heading: 'Your choices',
            status: 'configured',
            paragraphs: [
              'You can view and edit your profile and addresses from your account, and see your orders and requests at any time. Deletion or correction requests can be sent through the contact page; identity is verified before we change anything.',
              'Notification emails are transactional — order, payment, dispatch and refund events — and deduplicated so the same event cannot email you twice.',
            ],
          },
          {
            heading: 'Grievance and statutory contacts',
            status: 'pending',
            paragraphs: [
              `Consumer-law and data-protection contact details (such as a grievance officer) are ${dash()} and must be supplied and reviewed by the owner before launch. They are intentionally absent here rather than guessed.`,
            ],
          },
        ],
      };
    }
    case 'terms':
    default: {
      const entity = getSetting<string | null>('store.legal_entity_name', null);
      return {
        requiresReview: requiresReview('policy.terms_summary') || !entity,
        sections: [
          {
            heading: 'About these terms',
            status: 'configured',
            paragraphs: [
              'These terms describe how the K-brands store behaves: what a price on a product page means, when a contract is formed, and how problems are handled. They are a working draft for the owner to review with professional advice before launch, not a legally approved document.',
            ],
          },
          {
            heading: 'Prices and availability',
            status: 'configured',
            paragraphs: [
              'All prices are shown in the store currency and include whatever tax treatment is stated on the product and checkout pages. Tax and duty configuration is owned by the business.',
              'Stock is held briefly while you check out. If another buyer takes the last unit first, we release the hold and tell you — we do not oversell.',
              'If this build shows a development sample, that page will say so: sample prices, images and stock are fictional and cannot be sold for real money.',
            ],
          },
          {
            heading: 'When your order becomes a contract',
            status: 'configured',
            paragraphs: [
              'Placing an order creates a record and reserves stock; the contract completes when we confirm the order after a verified payment (or, if offered, at the agreed cash-on-delivery point). A payment is only ever confirmed by the provider on our servers, never by a browser redirect.',
            ],
          },
          {
            heading: 'Seller identity',
            status: entity ? 'configured' : pending,
            paragraphs: entity
              ? [`Sold by ${entity}.`]
              : [`Seller legal name, registration details and billing address are ${dash()} and will be published on this page before the store accepts live orders.`],
          },
          {
            heading: 'Acceptable use',
            status: 'configured',
            paragraphs: [
              'Please do not attempt to access another customer’s data, automate purchases to hoard stock, or probe endpoints we rate-limit. Login, checkout, coupon and contact endpoints are rate-limited, and abuse can suspend an account.',
            ],
          },
        ],
      };
    }
  }
}
