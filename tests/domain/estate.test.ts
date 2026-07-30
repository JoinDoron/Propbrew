import { describe, expect, it } from 'vitest';
import * as seed from '@/server/data/seed/fixtures';
import {
  npsScore, sentimentBreakdown, communityHealth, complaintHotspots, churnRisk,
  debtorRisk, recoveryForecast, nextDunningStage,
  nextTenancyStage, leaseRunwayDays, depositExposureMinor,
  isParcelOverdue, parcelStats, lockerUtilization,
  motionTally, motionOutcome, eventFillPct, isEventFull, eventState, amenityLoad,
  tierFor, tierProgress, pointsIssued, leaderboard,
  termStatus, meetingState,
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

describe('governance & e-voting', () => {
  it('tallies turnout vs quorum and approval vs threshold', () => {
    const solar = seed.motions.find((m) => m.id === 'mo-2')!; // 77 turnout of 240 = 32% < 33% quorum
    const t = motionTally(solar);
    expect(t.quorumMet).toBe(false);
    expect(t.approvalPct).toBeGreaterThanOrEqual(solar.thresholdPct); // approval clears, quorum doesn't
    expect(t.passing).toBe(false);
    // one more 'for' vote crosses quorum (78/240 → 33%)
    const nudged = { ...solar, forWeight: solar.forWeight + 1 };
    expect(motionTally(nudged).quorumMet).toBe(true);
    expect(motionOutcome(nudged)).toBe('passed');
  });
  it('resolves outcomes: passed vs quorum_failed', () => {
    expect(motionOutcome(seed.motions.find((m) => m.id === 'mo-1')!)).toBe('passed');
    expect(motionOutcome(seed.motions.find((m) => m.id === 'mo-4')!)).toBe('quorum_failed');
  });
});

describe('events & amenities', () => {
  it('computes fill, fullness and ranks amenity demand (excluding past)', () => {
    expect(eventFillPct(seed.communityEvents.find((e) => e.id === 'ev-2')!)).toBe(95); // 38/40
    expect(isEventFull(seed.communityEvents.find((e) => e.id === 'ev-5')!)).toBe(true); // 30/30
    expect(eventState(seed.communityEvents.find((e) => e.id === 'ev-6')!, NOW)).toBe('past'); // ended 07-21
    expect(amenityLoad(seed.communityEvents, NOW)[0].venue).toBe('Clubhouse Hall'); // AGM draws most RSVPs
  });
});

describe('loyalty & rewards', () => {
  it('assigns tiers, progress and leaderboard order', () => {
    expect(tierFor(3240)).toBe('platinum');
    expect(tierFor(1880)).toBe('gold');
    expect(tierFor(640)).toBe('silver');
    expect(tierFor(210)).toBe('bronze');
    const p = tierProgress(640);
    expect(p.next).toBe('gold'); expect(p.toNext).toBe(860);
    expect(pointsIssued(seed.rewardMembers)).toBe(7770);
    expect(leaderboard(seed.rewardMembers)[0].residentName).toBe('Yusuf Bello');
  });
});

describe('board & committee', () => {
  it('flags term expiry and meeting quorum', () => {
    const kemi = seed.boardMembers.find((m) => m.id === 'bd-4')!; // term ends 2026-08-31 (~36d)
    const yusuf = seed.boardMembers.find((m) => m.id === 'bd-2')!; // term ends 2027-08-31
    expect(termStatus(kemi, NOW).band).toBe('warn');
    expect(termStatus(yusuf, NOW).band).toBe('success');
    const held = seed.meetings.find((m) => m.id === 'mt-3')!; // 5 present, quorum 3
    expect(meetingState(held, NOW).quorate).toBe(true);
    expect(meetingState(held, NOW).label).toBe('Held · quorate');
  });
});
