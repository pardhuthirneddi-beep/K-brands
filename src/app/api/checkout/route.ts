import { NextResponse } from 'next/server';
import { handler, ipHashFrom, readJson } from '@/lib/api.ts';
import { checkoutSchema, parseWith } from '@/lib/validation.ts';
import { AppError } from '@/lib/errors.ts';
import { placeOrder } from '@/domain/orders.ts';
import { INDIAN_STATES } from '@/domain/constants.ts';
import { checkServiceability } from '@/adapters/shipping.ts';
import { startPayment } from '@/adapters/payment.ts';
import * as env from '@/lib/env.ts';
import { readCartKey, readUser } from '@/lib/session.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const body = await readJson(req);
  const user = await readUser();
  const cartKey = await readCartKey(user);
  if (!cartKey) return NextResponse.json({ error: 'Your bag is empty.' }, { status: 400 });
  const ip = ipHashFrom(req);
  return handler(req, {
    method: 'POST',
    rate: { rule: 'checkout', scope: () => `checkout:${user?.id ?? ip}` },
    run: async () => {
      const parsed = parseWith(checkoutSchema, body);
      if (!parsed.ok) throw new AppError('validation_error', parsed.message, 400, parsed.fieldErrors);
      const v = parsed.value;

      // Server-side address + serviceability checks (never trust the browser copy).
      const state = INDIAN_STATES.find((s) => s.code === v.shipping.stateCode.toUpperCase());
      if (!state) throw new AppError('validation_error', 'Choose a valid destination state.', 400, {
        'shipping.stateCode': 'Unknown state code',
      });
      const service = checkServiceability({ pincode: v.shipping.pincode, countryCode: v.shipping.countryCode });
      if (!service.serviceable) {
        throw new AppError('shipping_unavailable', service.reason ?? 'We cannot deliver to this PIN code yet.', 503);
      }

      const shippingAddress = { ...v.shipping, stateName: state.name, countryCode: v.shipping.countryCode ?? 'IN' };
      const result = placeOrder({
        cartKey,
        userId: user?.id ?? null,
        email: v.email,
        phone: v.phone,
        shipping: shippingAddress,
        billing: v.billingSame ? undefined : { ...v.billing!, stateName: state.name },
        useCod: v.useCod,
        idempotencyKey: v.idempotencyKey,
        customerNote: v.customerNote ?? null,
        ip,
      });
      if (result.reused) {
        return NextResponse.json({
          orderNumber: result.orderNumber,
          duplicate: true,
          redirect: `/order/${result.orderNumber}`,
          message: 'This order was already placed — we have not created a second one.',
        });
      }
      const order = { id: result.orderId, orderNumber: result.orderNumber };
      let payment: { providerPaymentId: string; mode: string; note: string | null } | null = null;
      if (!v.useCod) {
        try {
          const intent = startPayment({
            orderId: order.id,
            orderNumber: order.orderNumber,
            amountCents: result.totalCents,
            currency: result.currency,
            useCod: false,
          });
          if (intent) {
            payment = {
              providerPaymentId: intent.providerPaymentId,
              mode: intent.mode,
              note:
                intent.mode === 'mock'
                  ? 'Test gateway only — no money has moved and no payment has been taken.'
                  : null,
            };
          }
        } catch (err) {
          if (err instanceof AppError && err.code === 'payment_unavailable') {
            // Honest, non-destructive: order stays pending, stock stays held, nothing is charged.
            return NextResponse.json({
              orderNumber: order.orderNumber,
              paymentUnavailable: true,
              message: err.publicMessage,
              redirect: `/order/${order.orderNumber}`,
              status: 'pending_payment',
            });
          }
          throw err;
        }
      }
      return NextResponse.json({
        orderNumber: order.orderNumber,
        totalCents: result.totalCents,
        currency: result.currency,
        sandbox: result.isSandbox || !env.livePaymentsAvailable,
        payment,
        redirect: `/order/${order.orderNumber}`,
      });
    },
  });
}
