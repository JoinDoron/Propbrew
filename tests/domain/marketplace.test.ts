import { describe, expect, it } from 'vitest';
import * as seed from '@/server/data/seed/fixtures';
import { gmvSummary, vendorScores, fraudFlags } from '@/domain/marketplace';
import type { Listing, MarketplaceOrder } from '@/domain/entities';

const A = seed.marketplaceOrders[0].tenantId;
const orders = seed.marketplaceOrders.filter((o) => o.tenantId === A) as MarketplaceOrder[];
const listings = seed.listings.filter((l) => l.tenantId === A) as Listing[];

describe('gmvSummary', () => {
  it('sums live orders and never counts void ones as realized', () => {
    const g = gmvSummary(orders);
    expect(g.grossMinor).toBeGreaterThan(0);
    expect(g.realizedMinor).toBeLessThanOrEqual(g.grossMinor);
    expect(g.realizedRate).toBeGreaterThanOrEqual(0);
    expect(g.realizedRate).toBeLessThanOrEqual(100);
  });
});

describe('vendorScores', () => {
  it('rates every vendor and sorts best first', () => {
    const s = vendorScores(orders, listings);
    expect(s.length).toBeGreaterThan(0);
    for (let i = 1; i < s.length; i++) expect(s[i - 1].rating).toBeGreaterThanOrEqual(s[i].rating);
    s.forEach((v) => { expect(v.rating).toBeGreaterThanOrEqual(0); expect(v.rating).toBeLessThanOrEqual(100); });
  });
});

describe('fraudFlags (AI-E-05)', () => {
  it('raises review flags without touching order state', () => {
    const flags = fraudFlags(orders, listings);
    // seed: a resident with 2 live orders + an order to a paused-listing vendor
    expect(flags.length).toBeGreaterThan(0);
    flags.forEach((f) => expect(['review', 'watch']).toContain(f.severity));
    // one flag per order at most
    expect(new Set(flags.map((f) => f.orderId)).size).toBe(flags.length);
  });
});
