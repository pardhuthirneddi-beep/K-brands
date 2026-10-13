import { enqueueNotification } from './notifications.ts';
import { get } from '../db/client.ts';

/** Notification fan-out triggered when a payment is verified server-side. */
export function enqueueOrderPaid(orderId: number, orderNumber: string): void {
  const recipient = get<{ email: string | null }>(
    `SELECT COALESCE(u.email, o.guest_email) AS email FROM orders o LEFT JOIN users u ON u.id = o.user_id WHERE o.id = ?`,
    [orderId],
  )?.email;
  if (!recipient) return;
  enqueueNotification({
    template: 'order_paid',
    recipient,
    dedupeKey: `order_paid:${orderNumber}`,
    subject: `K-brands ${orderNumber}: payment confirmed`,
    bodyText: `We have confirmed your payment for order ${orderNumber}. We will let you know as soon as it is on its way.`,
    relatedType: 'order',
    relatedId: orderNumber,
  });
}
