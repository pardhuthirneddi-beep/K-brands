'use client';

import { useState } from 'react';
import { apiFetch } from '../providers.tsx';
import { formatMoney } from '@/domain/money.ts';
import { Spinner } from '../ui/spinner.tsx';

/**
 * Payment state is read from the server, which asks the provider. The browser's
 * redirect alone never flips an order to “paid”.
 */
export function PaymentStatusPanel({
  orderId,
  orderNumber,
  paymentStatus,
  provider,
  providerMode,
  method,
  failureMessage,
  amountCents,
  currency,
  status,
}: {
  orderId: number;
  orderNumber: string;
  paymentStatus: string;
  provider: string | null;
  providerMode: string | null;
  method: string | null;
  failureMessage: string | null;
  amountCents: number;
  currency: string;
  status: string;
}) {
  const [checking, setChecking] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const needsAttention = ['unpaid', 'pending', 'failed'].includes(paymentStatus);
  const payable = ['pending_payment', 'awaiting_payment_confirmation', 'payment_failed'].includes(status);

  async function check() {
    setChecking(true);
    try {
      const res = await apiFetch<{ status: string; message: string }>(`/api/payments/status?orderId=${String(orderId)}`, {
        method: 'POST',
      });
      setNote(res.message);
      window.setTimeout(() => window.location.reload(), 900);
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'We could not confirm the payment status.');
    } finally {
      setChecking(false);
    }
  }

  return (
    <section
      className={`border px-5 py-4 ${
        paymentStatus === 'captured' ? 'border-alert-ok/30 bg-alert-ok/5' : needsAttention ? 'border-alert-warn/35 bg-alert-warn/5' : 'border-stone-200 bg-white/60'
      }`}
      aria-live="polite"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-xl">
          <h2 className="eyebrow mb-1.5">Payment</h2>
          <p className="text-[15px] leading-snug">
            {paymentStatus === 'captured'
              ? `Confirmed — ${formatMoney(amountCents, currency)} via ${method === 'cash_on_delivery' ? 'cash on delivery' : (provider ?? 'gateway')}.`
              : paymentStatus === 'authorized'
                ? 'Authorised by your bank and awaiting capture.'
                : paymentStatus === 'refunded' || paymentStatus === 'partially_refunded'
                  ? `${paymentStatus === 'refunded' ? 'Refunded' : 'Partially refunded'} on the original payment method.`
                  : method === 'cash_on_delivery'
                    ? `Cash on delivery: ${formatMoney(amountCents, currency)} payable to the courier.`
                    : `Not yet confirmed — ${formatMoney(amountCents, currency)} is outstanding.`}
          </p>
          {providerMode === 'mock' ? (
            <p className="mt-2 text-[12.5px] leading-relaxed text-alert-warn">
              Handled by the <strong>test payment adapter</strong>. No real money has moved, and no product will be
              dispatched from this order.
            </p>
          ) : null}
          {failureMessage ? <p className="mt-2 text-[12.5px] text-alert-error">{failureMessage}</p> : null}
          {note ? <p className="mt-2 text-[12.5px] leading-relaxed text-ink-600">{note}</p> : null}
        </div>
        {payable ? (
          <button type="button" onClick={check} disabled={checking} className="btn-outline whitespace-nowrap py-2 text-[11.5px]">
            {checking ? <Spinner label="Checking" /> : 'Check payment status'}
          </button>
        ) : null}
      </div>
      {payable && paymentStatus !== 'captured' ? (
        <p className="mt-3 border-t border-stone-200 pt-3 text-[12.5px] leading-relaxed text-ink-500">
          Online payment is not available because no provider is connected to this deployment. Your order is held for
          the stock window and can be cancelled any time before dispatch. We will never mark this order paid from this
          screen — only a verified confirmation from the payment provider can do that.
        </p>
      ) : null}
    </section>
  );
}
