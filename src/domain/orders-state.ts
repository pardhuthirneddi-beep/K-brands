export type { OrderStatus } from './orders.ts';
import type { OrderStatus } from './orders.ts';

const TRANSITIONS: Record<string, OrderStatus[]> = {
  pending_payment: ['awaiting_payment_confirmation', 'paid', 'cancelled', 'payment_failed', 'expired'],
  awaiting_payment_confirmation: ['paid', 'payment_failed', 'cancelled', 'pending_payment'],
  payment_failed: ['awaiting_payment_confirmation', 'paid', 'cancelled', 'expired'],
  paid: ['awaiting_fulfilment', 'cancelled', 'refunded', 'partially_refunded', 'cancellation_requested', 'returns_requested'],
  awaiting_fulfilment: ['packed', 'shipped', 'cancelled', 'cancellation_requested', 'returns_requested', 'refunded'],
  packed: ['shipped', 'cancelled', 'cancellation_requested', 'returns_requested'],
  shipped: ['out_for_delivery', 'delivered', 'returns_requested', 'cancellation_requested'],
  out_for_delivery: ['delivered', 'returns_requested'],
  delivered: ['returns_requested', 'cancellation_requested', 'partially_refunded', 'refunded'],
  cancellation_requested: ['cancelled', 'delivered', 'shipped', 'awaiting_fulfilment', 'paid'],
  returns_requested: ['returned', 'refunded', 'partially_refunded', 'delivered', 'paid'],
  returned: ['refunded', 'partially_refunded'],
  refunded: [],
  partially_refunded: ['refunded', 'returns_requested'],
  cancelled: ['refunded'],
  expired: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  if (from === to) return true;
  return (TRANSITIONS[from] ?? []).includes(to);
}
