import { describe, expect, it } from 'vitest';
import * as seed from '@/server/data/seed/fixtures';
import {
  npsScore, sentimentBreakdown, communityHealth, complaintHotspots, churnRisk,
  debtorRisk, recoveryForecast, nextDunningStage,
  nextTenancyStage, leaseRunwayDays, depositExposureMinor,
  isParcelOverdue, parcelStats, lockerUtilization,
} from '@/domain/estate/engine';

const NOW = Date.parse('2026-07-26');

describe('community pulse', () => {
  it('scores sentiment, NPS and community health', () => {
    const b = sentimentBreakdown(seed.residentFeedback);
    expect(b.positive).toBe(3); expect(b.negative).toBe(3); expect(b.neutral).toBe(2);
    expect(npsScore(seed.residentFeedback)).toBe(0); // equal promoters/detractors
    const h = communityHealth(seed.engagementSnapshot[0], seed.residentFeedback, seed.complaints);
    expect(h.score).toBeGreaterThan(0); expect(h.score).toBeLessThanOrEqual(100);
  });
  it('ranks complaint hotspots worst-first and scores churn risk', () => {
    const spots = complaintHotspots(seed.complaints);
    expect(spots[0].building).toBe('Block D'); // has the open high-severity complaint
    const risk = churnRisk({ name: 'X', unitLabel: 'U', arrearsMinor: 25_000_000, complaints: 0, engaged: false });
    expect(risk.band).toBe('danger');
  });
});

describe('collections', () => {
  it('scores debtor risk from aging, exposure and broken promises', () => {
    const amina = seed.collectionCases.find((c) => c.id === 'col-1')!; // 57d, broken promise
    const david = seed.collectionCases.find((c) => c.id === 'col-5')!; // 6d, small
    expect(debtorRisk(amina).band).toBe('danger');
    expect(debtorRisk(amina).score).toBeGreaterThan(debtorRisk(david).score);
  });
  it('forecasts recovery below the outstanding total', () => {
    const f = recoveryForecast(seed.collectionCases);
    expect(f.outstandingMinor).toBe(61_000_000); // ₦610,000 across 5 cases
    expect(f.expectedMinor).toBeLessThan(f.outstandingMinor);
    expect(f.recoveryPct).toBeGreaterThan(0);
    expect(nextDunningStage('reminder')).toBe('notice');
    expect(nextDunningStage('escalated')).toBe('escalated');
  });
});

describe('tenancy', () => {
  it('advances the lifecycle and computes lease runway + deposit exposure', () => {
    expect(nextTenancyStage('applied')).toBe('screening');
    const folake = seed.tenancies.find((t) => t.id === 'tn-4')!; // lease ends 2026-08-31
    expect(leaseRunwayDays(folake, NOW)).toBe(36);
    expect(depositExposureMinor(seed.tenancies)).toBe(765_000_000); // all held/pending
  });
});

describe('parcels & lockers', () => {
  it('flags overdue parcels and computes room stats', () => {
    const overdue = seed.parcels.find((p) => p.id === 'pc-3')!; // received 07-21
    const fresh = seed.parcels.find((p) => p.id === 'pc-1')!; // received 07-25
    expect(isParcelOverdue(overdue, NOW)).toBe(true);
    expect(isParcelOverdue(fresh, NOW)).toBe(false);
    const s = parcelStats(seed.parcels, NOW);
    expect(s.inLocker).toBe(3); expect(s.awaiting).toBe(1); expect(s.overdue).toBe(1); expect(s.collectedToday).toBe(1);
    expect(lockerUtilization(seed.lockers).pct).toBe(50); // 4 of 8 used
  });
});
