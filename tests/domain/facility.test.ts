import { describe, expect, it } from 'vitest';
import * as seed from '@/server/data/seed/fixtures';
import { siteHealth, alarmCounts, refuelForecast, fuelAnomaly, gridReliancePct, stockSignal, contractStatus, coverageGap, permitConflicts, visitorStats, isOverstay, accessThreats, targetProgress, esgScore, reductionScenarios, copilotInsights, askCopilot, type CopilotWorld } from '@/domain/facility/engine';
import type { Generator, Part } from '@/domain/facility/types';

const NOW = Date.parse('2026-07-28');
const NOW26 = Date.parse('2026-07-26');

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

describe('access & visitors', () => {
  it('counts on-site, expected today and denied', () => {
    const s = visitorStats(seed.visitorPasses, NOW26);
    expect(s.onSite).toBe(2); // vp-2 contractor + vp-3 overnight guest
    expect(s.expectedToday).toBe(3); // vp-1, vp-4, vp-7
    expect(s.deniedToday).toBe(1); // vp-6
  });
  it('flags a checked-in visitor past their window as an overstay', () => {
    const overstay = seed.visitorPasses.find((p) => p.id === 'vp-3')!; // validTo 07-25, still checked in
    const ok = seed.visitorPasses.find((p) => p.id === 'vp-2')!; // validTo 07-26
    expect(isOverstay(overstay, NOW26)).toBe(true);
    expect(isOverstay(ok, NOW26)).toBe(false);
  });
  it('surfaces forced/held/offline points as threats', () => {
    const threats = accessThreats(seed.accessPoints);
    expect(threats.map((p) => p.id).sort()).toEqual(['ap-3', 'ap-5']); // held_open + offline
  });
});

describe('sustainability', () => {
  it('computes direction-agnostic target progress', () => {
    const carbon = seed.sustainabilityTargets.find((t) => t.id === 'st-carbon')!; // 12000 → 9800 → 7000
    const p = targetProgress(carbon);
    expect(p.pct).toBe(44);
    expect(p.onTrack).toBe(false);
    const genset = seed.sustainabilityTargets.find((t) => t.id === 'st-genset')!; // 45 → 30 → 20
    expect(targetProgress(genset).onTrack).toBe(true); // 60%
  });
  it('scores ESG and models reduction pathways from diesel burn', () => {
    const reliance = gridReliancePct(seed.facilityGenerators);
    const esg = esgScore(reliance.gensetPct, seed.sustainabilityTargets);
    expect(esg.score).toBeGreaterThan(0);
    expect(esg.score).toBeLessThanOrEqual(100);
    const litres = seed.facilityGenerators.reduce((n, g) => n + Math.round(g.runtimeHoursMonth * g.litresPerHour), 0);
    const scenarios = reductionScenarios(litres);
    expect(scenarios).toHaveLength(4);
    expect(scenarios[0].co2SavedKg).toBeGreaterThan(0);
    expect(scenarios[0].paybackMonths).toBeGreaterThan(0);
  });
});

describe('AI copilot', () => {
  const world: CopilotWorld = {
    systems: seed.buildingSystems, alarms: seed.facilityAlarms, generators: seed.facilityGenerators,
    parts: seed.facilityParts, contracts: seed.facilityContracts, permits: seed.facilityPermits,
    incidents: seed.facilityIncidents, sensors: seed.facilitySensors, nowMs: NOW26,
  };
  it('fuses every signal into a ranked, actionable list', () => {
    const insights = copilotInsights(world);
    expect(insights.length).toBeGreaterThanOrEqual(5);
    expect(insights[0].severity).toBe('critical'); // an unacked critical alarm or dry-tank generator
    expect(insights.some((i) => i.action.kind === 'dispatch_alarm')).toBe(true);
    expect(insights.some((i) => i.action.kind === 'reorder_part')).toBe(true);
  });
  it('answers natural-language questions deterministically', () => {
    expect(askCopilot('how is our fuel and diesel?', world).answer).toContain('Block C');
    expect(askCopilot('which contracts are expiring?', world).answer.toLowerCase()).toContain('contract');
    const now = askCopilot('what needs me right now?', world);
    expect(now.answer.length).toBeGreaterThan(0);
    expect(now.sources.length).toBeGreaterThan(0);
  });
});
