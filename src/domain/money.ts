/**
 * Monetary amounts are integer minor units (paise for INR) everywhere in the
 * system — never floats. Tax rates are basis points (1/100 of a percent) so
 * percentages stay exact.
 */
export type MinorUnits = number; // paise

export const CURRENCY_SYMBOL: Record<string, string> = { INR: '₹', USD: '$', EUR: '€', GBP: '£' };

export function toMinorUnits(major: number | string): MinorUnits {
  const n = typeof major === 'string' ? Number(major) : major;
  if (!Number.isFinite(n)) throw new Error('invalid amount');
  return Math.round(n * 100);
}

export function toMajorUnits(minor: MinorUnits): number {
  return minor / 100;
}

export function addAmounts(...amounts: MinorUnits[]): MinorUnits {
  return amounts.reduce((sum, a) => sum + Math.trunc(a), 0);
}

/** Half-up rounding on minor units — used for discount/tax split remainders. */
export function roundMinor(value: number): MinorUnits {
  return Math.sign(value) * Math.round(Math.abs(value));
}

export function applyPercentBps(amount: MinorUnits, bps: number): MinorUnits {
  return roundMinor((amount * bps) / 10000);
}

export function capDiscount(amount: MinorUnits, max: number | null | undefined): MinorUnits {
  if (max == null) return amount;
  return Math.min(amount, Math.max(0, Math.trunc(max)));
}

export function formatMoney(minor: MinorUnits, currency = 'INR', locale = 'en-IN'): string {
  const safe = Number.isFinite(minor) ? Math.trunc(minor) : 0;
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: safe % 100 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(safe / 100);
  } catch {
    const sym = CURRENCY_SYMBOL[currency] ?? `${currency} `;
    return `${sym}${(safe / 100).toFixed(2)}`;
  }
}

export function formatMoneyParts(minor: MinorUnits, currency = 'INR') {
  const major = Math.abs(minor) / 100;
  return {
    symbol: CURRENCY_SYMBOL[currency] ?? `${currency} `,
    whole: Math.floor(major).toLocaleString('en-IN'),
    fraction: String(Math.round((major % 1) * 100)).padStart(2, '0'),
    negative: minor < 0,
  };
}

/** Percentage saved between compare-at and selling price, for UI badges. */
export function discountPercent(price: MinorUnits, compareAt: MinorUnits | null | undefined): number | null {
  if (!compareAt || compareAt <= price) return null;
  return Math.round(((compareAt - price) / compareAt) * 100);
}
