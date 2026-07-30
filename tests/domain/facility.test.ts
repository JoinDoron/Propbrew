import { describe, expect, it } from 'vitest';
import * as seed from '@/server/data/seed/fixtures';
import { siteHealth, alarmCounts, refuelForecast, fuelAnomaly, gridReliancePct, stockSignal, contractStatus, coverageGap, permitConflicts } from '@/domain/facility/engine';
import type { Generator, Part } from '@/domain/facility/types';

const NOW = Date.parse('2026-07-28');

describe('control center', () => {
  it('scores composite site health and counts open alarms', () => {
    const h = siteHealth(seed.buildingSystems);
    expect(h.score).toBeGreaterThan(0);
    expect(h.score).toBeLessThanOrEqual(100);
    const c = alarmCounts(seed.facilityAlarms);
    expect(c.critical).toBeGreaterThanOrEqual(1); // Block C generator
    expect(c.active).toBeGreaterThanOrEqual(c.critical);
  });
});

describe('energy intelligence', () => {
  it('predicts refuel runway and flags a fuel anomaly', () => {
    const genC = seed.facilityGenerators.find((g: Generator) => g.id === 'gn-c')!;
    const f = refuelForecast(genC, NOW);
    expect(f.litresRemaining).toBe(340);
    expect(f.daysToEmpty).toBeGreaterThan(0);
    expect(fuelAnomaly(genC).anomalous).toBe(true); // 62 vs 52 baseline = +19%
    expect(fuelAnomaly(seed.facilityGenerators.find((g: Generator) => g.id === 'gn-d')!).anomalous).toBe(false);
  });
  it('computes genset vs grid reliance', () => {
    const r = gridReliancePct(seed.facilityGenerators);
    expect(r.gensetPct + r.gridPct).toBe(100);
  });
});

describe('inventory / contracts / safety', () => {
  it('flags below-reorder parts and stock-out days', () => {
    const gas = seed.facilityParts.find((p: Part) => p.id === 'pt-1')!; // 6 stock, reorder 8
    const s = stockSignal(gas);
    expect(s.belowReorder).toBe(true);
    expect(s.band).toBe('danger');
  });
  it('detects contract expiry and coverage gaps', () => {
    const expired = seed.facilityContracts.find((c) => c.id === 'ct-4')!; // ends 2026-07-20
    expect(contractStatus(expired, NOW).label).toBe('Expired');
    const gaps = coverageGap(seed.facilityContracts, NOW);
    expect(gaps).toContain('water'); // no water contract seeded
    expect(gaps).toContain('access');
  });
  it('detects overlapping permits in the same location', () => {
    const conflicts = permitConflicts(seed.facilityPermits);
    expect(conflicts.length).toBeGreaterThanOrEqual(1); // hot-work + electrical both Block C Plant room, 07-28
  });
});
