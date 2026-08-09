/**
 * Foreign-exchange primitives — pure, framework-free, sits beside `Money`.
 *
 * The platform keeps its books in ONE reporting currency (NGN). A transaction
 * denominated in a foreign currency is posted to the ledger in NGN at the rate
 * on the day it was booked; the foreign amount is retained so the outstanding
 * balance can be REVALUED as the rate moves. This is how real ERPs handle FX —
 * base-currency rollups never change, and exposure is a separate lens.
 *
 * A rate is quoted as "reporting units per 1 foreign unit" (NGN per USD). The
 * reporting currency always converts to itself at 1.
 */

import { type CurrencyCode, type Money, money } from './primitives';

/** Every rollup lands here. Foreign amounts are converted to it for reporting. */
export const REPORTING_CURRENCY: CurrencyCode = 'NGN';

/** All four supported currencies use 100 minor units, so a minor-unit rate is a
 *  straight multiply. Guard here so adding a 0- or 1000-subunit currency later
 *  can't silently misprice. */
const SUBUNITS: Record<CurrencyCode, number> = { NGN: 100, USD: 100, GHS: 100, KES: 100 };

export type FxRate = {
  /** The foreign currency this rate prices. */
  currency: CurrencyCode;
  /** Reporting units (NGN) per 1 foreign unit. 1 USD = 1600 → rate 1600. */
  rate: number;
  asOfISO: string;
  /** The rate this one replaced — kept so movement can be shown. */
  priorRate?: number;
};

export type FxTable = Readonly<Record<string, FxRate>>;

/** Index rates by currency, latest `asOfISO` winning. The reporting currency is
 *  always present at 1 even if no row was supplied. */
export function fxTable(rates: readonly FxRate[]): FxTable {
  const out: Record<string, FxRate> = {
    [REPORTING_CURRENCY]: { currency: REPORTING_CURRENCY, rate: 1, asOfISO: '' },
  };
  for (const r of rates) {
    const prev = out[r.currency];
    if (!prev || Date.parse(r.asOfISO) >= Date.parse(prev.asOfISO)) out[r.currency] = r;
  }
  return out;
}

/** NGN per 1 unit of `currency`. Reporting currency is 1; a missing rate throws,
 *  because silently treating an unpriced currency as 1:1 would corrupt a total. */
export function rateOf(currency: CurrencyCode, table: FxTable): number {
  if (currency === REPORTING_CURRENCY) return 1;
  const r = table[currency];
  if (!r) throw new Error(`No FX rate for ${currency}`);
  return r.rate;
}

/**
 * Convert `fromMinor` minor units of `from` into minor units of `to`, crossing
 * through the reporting currency. Both currencies are assumed to use the same
 * subunit scale (100); a mismatch throws rather than misprice.
 */
export function convertMinor(fromMinor: number, from: CurrencyCode, to: CurrencyCode, table: FxTable): number {
  if (from === to) return fromMinor;
  if (SUBUNITS[from] !== SUBUNITS[to]) throw new Error(`Subunit scale mismatch ${from}/${to}`);
  // reporting-per-from ÷ reporting-per-to = to-per-from
  return Math.round((fromMinor * rateOf(from, table)) / rateOf(to, table));
}

/** Convert Money to the reporting currency. Already-NGN Money returns unchanged —
 *  no rate lookup, no rounding. */
export function toReporting(m: Money, table: FxTable): Money {
  if (m.currency === REPORTING_CURRENCY) return m;
  return money(convertMinor(m.minor, m.currency, REPORTING_CURRENCY, table), REPORTING_CURRENCY);
}

/** Convert Money into any display currency. */
export function convertMoney(m: Money, to: CurrencyCode, table: FxTable): Money {
  return m.currency === to ? m : money(convertMinor(m.minor, m.currency, to, table), to);
}

/** Signed move of a rate against the one it replaced, as a percentage. A rise
 *  (naira weakening) is positive — and a positive move raises the NGN cost of a
 *  foreign payable, i.e. an FX loss for a buyer. */
export function fxMovementPct(r: FxRate): number | null {
  if (!r.priorRate) return null;
  return Math.round(((r.rate - r.priorRate) / r.priorRate) * 1000) / 10;
}

export const CURRENCY_SYMBOL: Record<CurrencyCode, string> = { NGN: '₦', USD: '$', GHS: 'GH₵', KES: 'KSh' };

/** Compact foreign display, e.g. "$250k", "GH₵1.2m". */
export function fmtForeign(minor: number, currency: CurrencyCode): string {
  const n = minor / 100;
  const body = n >= 1e9 ? `${(n / 1e9).toFixed(2)}bn` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}m` : n >= 1e3 ? `${Math.round(n / 1000)}k` : `${Math.round(n)}`;
  return `${CURRENCY_SYMBOL[currency]}${body}`;
}
