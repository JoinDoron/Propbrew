import { describe, expect, it } from 'vitest';
import { jobEarnings, orderEarnings, listingStats, perListing } from '@/domain/vendor-portal';

describe('jobEarnings', () => {
  it('splits earned (done) from pipeline (open)', () => {
    const e = jobEarnings([
      { status: 'closed', costMinor: 3_000_000 },
      { status: 'in_progress', costMinor: 1_000_000 },
      { status: 'assigned', costMinor: null },
    ]);
    expect(e.earnedMinor).toBe(3_000_000);
    expect(e.pipelineMinor).toBe(1_000_000);
    expect(e.activeJobs).toBe(2);
    expect(e.doneJobs).toBe(1);
  });
});

describe('orderEarnings', () => {
  it('counts new orders and sums fulfilled revenue', () => {
    const o = orderEarnings([
      { status: 'placed', amountMinor: 2_500_000 },
      { status: 'fulfilled', amountMinor: 1_500_000 },
      { status: 'accepted', amountMinor: 1_800_000 },
    ]);
    expect(o.newOrders).toBe(1);
    expect(o.fulfilled).toBe(1);
    expect(o.earnedMinor).toBe(1_500_000);
    expect(o.pendingMinor).toBe(2_500_000 + 1_800_000);
  });
});

describe('listing performance', () => {
  it('reports live/paused and per-listing revenue', () => {
    const listings = [{ id: 'a', status: 'active', priceMinor: 100 }, { id: 'b', status: 'paused', priceMinor: 200 }];
    const orders = [{ listingTitle: 'AC', amountMinor: 2_500_000, status: 'fulfilled' }, { listingTitle: 'AC', amountMinor: 2_500_000, status: 'placed' }];
    const s = listingStats(listings, orders);
    expect(s.live).toBe(1);
    expect(s.paused).toBe(1);
    expect(s.revenueMinor).toBe(2_500_000);
    expect(perListing('AC', orders)).toEqual({ orders: 2, revenueMinor: 2_500_000 });
  });
});
