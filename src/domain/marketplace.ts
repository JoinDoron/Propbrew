/**
 * EM-09 / AI-E-05 — marketplace analytics: GMV, a vendor performance scorecard,
 * and a fraud-signal engine. All deterministic. The AI-E-05 invariant is a hard
 * rule the UI honours: fraud signals go to a HUMAN review queue and never
 * auto-decline or block an order. This module only surfaces signals.
 */

import type { Listing, MarketplaceOrder } from './entities';
import type { OrderStatus } from './enums';
import type { Tone } from '@/lib/status-tones';

export const PIPELINE: OrderStatus[] = ['placed', 'accepted', 'fulfilled', 'closed'];
export const BRANCHES: OrderStatus[] = ['declined', 'refunded', 'expired'];
const REALIZED: OrderStatus[] = ['fulfilled', 'closed'];
const LIVE: OrderStatus[] = ['placed', 'accepted', 'fulfilled', 'closed'];
const VOID: OrderStatus[] = ['declined', 'refunded', 'expired'];

export type Gmv = { grossMinor: number; realizedMinor: number; pendingMinor: number; voidMinor: number; orders: number; realizedRate: number };

export function gmvSummary(orders: readonly MarketplaceOrder[]): Gmv {
  const sum = (pred: (o: MarketplaceOrder) => boolean) => orders.filter(pred).reduce((n, o) => n + o.amount.minor, 0);
  const gross = sum((o) => LIVE.includes(o.status));
  const realized = sum((o) => REALIZED.includes(o.status));
  const fulfilled = orders.filter((o) => REALIZED.includes(o.status)).length;
  const live = orders.filter((o) => LIVE.includes(o.status)).length;
  return {
    grossMinor: gross,
    realizedMinor: realized,
    pendingMinor: sum((o) => o.status === 'placed' || o.status === 'accepted'),
    voidMinor: sum((o) => VOID.includes(o.status)),
    orders: orders.length,
    realizedRate: live ? Math.round((fulfilled / live) * 100) : 0,
  };
}

export type VendorScore = {
  vendorOrgId: string;
  vendorName: string;
  orders: number;
  acceptedRate: number;
  fulfilledRate: number;
  gmvMinor: number;
  activeListings: number;
  pausedListings: number;
  rating: number; // 0–100 composite
  tone: Tone;
};

/** Per-vendor scorecard: acceptance & fulfilment rates, GMV and a composite
 *  rating (accept 40% · fulfil 45% · catalogue health 15%). */
export function vendorScores(orders: readonly MarketplaceOrder[], listings: readonly Listing[]): VendorScore[] {
  const ids = Array.from(new Set([...orders.map((o) => o.vendorOrgId), ...listings.map((l) => l.vendorOrgId)]));
  return ids
    .map((id) => {
      const os = orders.filter((o) => o.vendorOrgId === id);
      const ls = listings.filter((l) => l.vendorOrgId === id);
      const name = ls[0]?.vendorName ?? id;
      const notDeclined = os.filter((o) => o.status !== 'declined' && o.status !== 'expired').length;
      const acceptedRate = os.length ? Math.round((notDeclined / os.length) * 100) : 100;
      const fulfilled = os.filter((o) => REALIZED.includes(o.status)).length;
      const fulfilledRate = os.length ? Math.round((fulfilled / os.length) * 100) : 0;
      const active = ls.filter((l) => l.status === 'active').length;
      const paused = ls.filter((l) => l.status === 'paused').length;
      const catHealth = ls.length ? Math.round((active / ls.length) * 100) : 100;
      const rating = Math.round(acceptedRate * 0.4 + fulfilledRate * 0.45 + catHealth * 0.15);
      return {
        vendorOrgId: id, vendorName: name, orders: os.length, acceptedRate, fulfilledRate,
        gmvMinor: os.filter((o) => LIVE.includes(o.status)).reduce((n, o) => n + o.amount.minor, 0),
        activeListings: active, pausedListings: paused, rating,
        tone: (rating >= 75 ? 'success' : rating >= 50 ? 'warn' : 'danger') as Tone,
      };
    })
    .sort((a, b) => b.rating - a.rating);
}

export type FraudFlag = { orderId: string; ref: string; residentName: string; amountMinor: number; severity: 'review' | 'watch'; reason: string; signal: string };

/**
 * Deterministic fraud signals for a HUMAN review queue (AI-E-05). Signals:
 *  - velocity: a resident with multiple live orders in the window
 *  - catalogue risk: an order against a vendor that has a paused listing
 *  - value anomaly: amount ≥ 1.8× the category median
 * None of these ever act on the order — they only raise a flag to review.
 */
export function fraudFlags(orders: readonly MarketplaceOrder[], listings: readonly Listing[]): FraudFlag[] {
  const live = orders.filter((o) => ['placed', 'accepted', 'fulfilled', 'closed'].includes(o.status));
  const byResident = new Map<string, number>();
  live.forEach((o) => byResident.set(o.ownerUserId, (byResident.get(o.ownerUserId) ?? 0) + 1));

  // category median from listings
  const priceByCat = new Map<string, number[]>();
  listings.forEach((l) => priceByCat.set(l.category, [...(priceByCat.get(l.category) ?? []), l.price.minor]));
  const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
  const pausedVendors = new Set(listings.filter((l) => l.status === 'paused').map((l) => l.vendorOrgId));

  const flags: FraudFlag[] = [];
  for (const o of live) {
    const reasons: { severity: FraudFlag['severity']; reason: string; signal: string }[] = [];
    if ((byResident.get(o.ownerUserId) ?? 0) >= 2) reasons.push({ severity: 'watch', signal: 'velocity', reason: `${byResident.get(o.ownerUserId)} live orders from this resident in the window` });
    if (pausedVendors.has(o.vendorOrgId)) reasons.push({ severity: 'review', signal: 'catalogue', reason: 'Order placed against a vendor with a paused listing' });
    const catListing = listings.find((l) => l.title === o.listingTitle);
    if (catListing) {
      const med = median(priceByCat.get(catListing.category) ?? []);
      if (med > 0 && o.amount.minor >= med * 1.8) reasons.push({ severity: 'review', signal: 'value', reason: `Amount ≥ 1.8× the ${catListing.category} median` });
    }
    // Take the most severe reason as the headline flag (one row per order).
    const top = reasons.sort((a, b) => (a.severity === 'review' ? -1 : 1) - (b.severity === 'review' ? -1 : 1))[0];
    if (top) flags.push({ orderId: o.id, ref: o.ref, residentName: o.residentName, amountMinor: o.amount.minor, ...top });
  }
  return flags;
}
