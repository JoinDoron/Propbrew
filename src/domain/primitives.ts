/**
 * Value primitives shared across the domain. No framework imports.
 */

/** ISO-8601 date-time string, e.g. "2026-07-26T08:00:00Z". */
export type ISODateTime = string;
/** ISO-8601 date, e.g. "2026-07-26". */
export type ISODate = string;

/**
 * Money is stored as an integer number of MINOR units (kobo for NGN, cents for
 * USD) plus a currency code — never a float. §18 prices the build in USD, but
 * the market, the gateways (Paystack/Flutterwave) and USSD are Nigerian, so
 * currency is per-tenant configuration, defaulting to NGN.
 *
 * Storing 2500.00 as a float invites rounding drift the moment it is summed
 * across a statement; integer minor units never drift.
 */
export type CurrencyCode = 'NGN' | 'USD' | 'GHS' | 'KES';

export type Money = {
  /** Integer minor units. ₦2,500.00 → 250000. */
  readonly minor: number;
  readonly currency: CurrencyCode;
};

export function money(minor: number, currency: CurrencyCode = 'NGN'): Money {
  if (!Number.isInteger(minor)) {
    throw new Error(`Money.minor must be an integer (got ${minor}) — pass minor units, not a decimal`);
  }
  return { minor, currency };
}

/** Build Money from a major-unit amount (₦2,500.00 → money from 2500). */
export function fromMajor(major: number, currency: CurrencyCode = 'NGN'): Money {
  return money(Math.round(major * 100), currency);
}

export function addMoney(a: Money, b: Money): Money {
  if (a.currency !== b.currency) {
    throw new Error(`Cannot add ${a.currency} to ${b.currency}`);
  }
  return money(a.minor + b.minor, a.currency);
}

export type GeoPoint = {
  readonly lat: number;
  readonly lng: number;
};

/** A stored photo or file reference. Evidence capture is required by FM-03/FM-06/EM-03. */
export type MediaRef = {
  readonly url: string;
  readonly kind: 'image' | 'document' | 'video';
  readonly caption?: string;
};

/** A cursor-paginated page. §12 sizing target is 10,000 units / 50,000 users (Q8). */
export type Page<T> = {
  readonly items: readonly T[];
  readonly total: number;
  readonly cursor: string | null;
};
