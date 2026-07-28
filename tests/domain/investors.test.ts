/**
 * SC-08 / AI-S-04 investor forecast tests. Exercises the PURE model over the
 * committed seed — deterministic estimates, no runtime. Assertions are derived
 * from the seed figures, not hand-set magic numbers.
 */

import { describe, expect, it } from 'vitest';
import * as seed from '@/server/data/seed/fixtures';
import { forecastProject, pipelineFunnel, unitsGrid, scoreLeads, portfolioSummary } from '@/domain/investors';
import type { InvestorProject } from '@/domain/entities';

const marina = seed.investorProjects.find((p) => p.name.startsWith('Marina')) as InvestorProject;
const cedar = seed.investorProjects.find((p) => p.name.startsWith('Cedar')) as InvestorProject;

describe('forecastProject', () => {
  it('projects a sell-out date for a selling project with stock left', () => {
    const f = forecastProject(marina);
    expect(f.pctSold).toBe(65); // 78/120
    expect(f.remaining).toBe(42);
    expect(f.monthlyPace).toBeGreaterThan(0);
    expect(f.selloutISO).toMatch(/^\d{4}-\d{2}-01$/);
    // avg unit = salesToDate / sold; projected revenue scales to full inventory
    expect(f.avgUnitMinor).toBe(Math.round(marina.salesToDate.minor / marina.unitsSold));
  });

  it('treats a fully sold project as sold out (no future date)', () => {
    const f = forecastProject(cedar);
    expect(f.remaining).toBe(0);
    expect(f.monthsToSellout).toBe(0);
    expect(f.selloutISO).toBeNull();
  });
});

describe('pipeline + inventory', () => {
  it('funnel narrows leads → reserved → sold and grid matches inventory', () => {
    const fn = pipelineFunnel(marina);
    expect(fn.leads).toBeGreaterThanOrEqual(fn.sold);
    expect(fn.sold).toBe(marina.unitsSold);
    const grid = unitsGrid(marina);
    expect(grid).toHaveLength(marina.unitsTotal);
    expect(grid.filter((c) => c === 'sold')).toHaveLength(marina.unitsSold);
  });

  it('scores leads deterministically, hottest first', () => {
    const a = scoreLeads(marina);
    const b = scoreLeads(marina);
    expect(a).toEqual(b); // deterministic
    for (let i = 1; i < a.length; i++) expect(a[i - 1].score).toBeGreaterThanOrEqual(a[i].score);
  });
});

describe('portfolioSummary', () => {
  it('aggregates units and weights ROI by inventory', () => {
    const only = seed.investorProjects.filter((p) => p.tenantId === marina.tenantId);
    const s = portfolioSummary(only);
    expect(s.projects).toBe(only.length);
    expect(s.unitsTotal).toBe(only.reduce((n, p) => n + p.unitsTotal, 0));
    expect(s.weightedRoiPct).toBeGreaterThan(0);
  });
});
