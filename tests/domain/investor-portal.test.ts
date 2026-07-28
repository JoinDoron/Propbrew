import { describe, expect, it } from 'vitest';
import * as seed from '@/server/data/seed/fixtures';
import { holdingOf, constructionProgress, paymentSchedule, handoverCountdown, projectReturns } from '@/domain/investor-portal';
import type { InvestorProject } from '@/domain/entities';

const marina = seed.investorProjects.find((p) => p.name.startsWith('Marina')) as InvestorProject;
const cedar = seed.investorProjects.find((p) => p.name.startsWith('Cedar')) as InvestorProject;

describe('holdingOf', () => {
  it('derives a deterministic stake with projected value ≥ invested', () => {
    const h = holdingOf(marina);
    expect(h.unitsHeld).toBeGreaterThanOrEqual(2);
    expect(h.investedMinor).toBe(h.unitsHeld * h.unitPriceMinor);
    expect(h.projectedValueMinor).toBeGreaterThanOrEqual(h.investedMinor);
    expect(holdingOf(marina)).toEqual(h); // stable
  });
});

describe('constructionProgress + schedule', () => {
  it('marks milestones by progress and one due installment', () => {
    const { pct, milestones } = constructionProgress(cedar); // construction stage
    expect(pct).toBeGreaterThan(0);
    expect(milestones.filter((m) => m.state === 'current')).toHaveLength(1);
    const sched = paymentSchedule(cedar, holdingOf(cedar));
    expect(sched.reduce((n, s) => n + s.pctOfPlan, 0)).toBe(100);
    expect(sched.filter((s) => s.status === 'due').length).toBeLessThanOrEqual(1);
  });
});

describe('handoverCountdown', () => {
  it('reports months to a future handover', () => {
    const c = handoverCountdown('2027-06-30', Date.parse('2026-07-26'));
    expect(c.days).toBeGreaterThan(0);
    expect(c.label).toContain('month');
  });
});

describe('projectReturns', () => {
  it('compounds appreciation and adds rental yield', () => {
    const p = projectReturns(100_000_000, 3, 10, 5);
    expect(p.capitalGainMinor).toBeGreaterThan(0);
    expect(p.rentalIncomeMinor).toBe(Math.round(100_000_000 * 0.05 * 3));
    expect(p.totalValueMinor).toBe(100_000_000 + p.capitalGainMinor + p.rentalIncomeMinor);
    expect(p.roiPct).toBeGreaterThan(0);
  });
});
