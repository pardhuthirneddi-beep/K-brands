import * as env from './env.ts';
import { getSetting } from '../domain/settings.ts';

/**
 * The honesty layer. Shown whenever the deployment cannot complete a real
 * purchase, so nobody mistakes a test store for a live shop.
 */
export function runtimeBanner(): string | null {
  if (env.livePaymentsAvailable && !env.demoCatalogueEnabled) {
    const shipping = getSetting<string>('shipping.mode', 'unconfigured');
    if (shipping === 'unconfigured') {
      return 'Payments are enabled but shipping is still unconfigured — delivery charges cannot be quoted yet.';
    }
    return null;
  }
  const bits: string[] = [];
  if (env.demoCatalogueEnabled) bits.push('sample catalogue in development — these are not real products');
  if (!env.livePaymentsAvailable) bits.push('no payment provider connected, so nothing here is a real transaction');
  if (bits.length === 0) return null;
  return `Pre-launch build: ${bits.join(' · ')}.`;
}
