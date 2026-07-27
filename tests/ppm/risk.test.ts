/**
 * AI-F-01 risk engine tests. Like the authz/isolation suites, this exercises the
 * PURE model (computeAllRisk) over the committed seed with manual scoping, so it
 * needs no server runtime. Assertions are on bands, ordering and invariants
 * computed FROM the seed — not brittle hand-set target scores.
 */

import { describe, expect, it } from 'vitest';
import { assertCan, applyScope, type Actor, type ScopableRow } from '@/lib/authz';
import { SEED } from '@/server/identities';
import * as seed from '@/server/data/seed/fixtures';
import { computeAllRisk, NOW, seasonOf } from '@/domain/ppm';

function scoped<T extends ScopableRow>(actor: Actor, cap: Parameters<typeof assertCan>[1], rows: readonly T[]): readonly T[] {
  return applyScope(rows, assertCan(actor, cap, 'read'));
}

const base = { estateIds: [] as readonly string[], allEstates: false, unitIds: [] as readonly string[], vendorOrgId: null as string | null, investorProjectIds: [] as readonly string[] };
const lekkiFM: Actor = { ...base, userId: 'u-fm', tenantId: SEED.tenantA, roles: ['facility_manager'], estateIds: [SEED.estateGardens, SEED.estateVictoria] };

function riskForFM() {
  // runtime is joined onto the scoped asset set (never scanned globally)
  const assets = scoped(lekkiFM, 'assets_ppm', seed.assets);
  const assetIds = new Set(assets.map((a) => String((a as { id: string }).id)));
  return computeAllRisk({
    assets: assets as never,
    plans: scoped(lekkiFM, 'assets_ppm', seed.ppmPlans) as never,
    workOrders: scoped(lekkiFM, 'work_orders', seed.workOrders) as never,
    runtime: seed.assetRuntime.filter((r) => assetIds.has(String(r.assetId))),
  });
}

describe('risk engine — determinism & scoring', () => {
  const risk = riskForFM();
  const by = (id: string) => risk.find((r) => String(r.assetId) === id);

  it('is deterministic (same inputs → identical output)', () => {
    expect(JSON.stringify(riskForFM())).toBe(JSON.stringify(riskForFM()));
  });

  it('scores every scoped asset that has a plan (5 in Gardens+Victoria)', () => {
    // gen-c, gen-d, lift, chiller(Victoria), pump — gate has no plan
    expect(risk.length).toBe(5);
    expect(by('ast-gate-1')).toBeUndefined(); // coverage gap, not scored
  });

  it('the out-of-service, overdue, out-of-warranty pump is Critical (highest)', () => {
    const pump = by('ast-pump-d')!;
    expect(pump.band).toBe('critical');
    expect(risk[0].assetId).toBe('ast-pump-d'); // sorted highest-first
  });

  it('the near-threshold Block C generator is runtime-driven and at-risk', () => {
    const gen = by('ast-gen-c')!;
    expect(['elevated', 'critical']).toContain(gen.band);
    expect(gen.topDriver).toBe('runtime');
    expect(gen.suggestedDate).toBeDefined(); // pull-forward proposed
    expect(gen.suggestReason).toMatch(/interval is 250h/);
  });

  it('the freshly-serviced Block D generator is healthier than Block C', () => {
    expect(by('ast-gen-d')!.score).toBeLessThan(by('ast-gen-c')!.score);
  });

  it('scores are 0–100 and bands follow the thresholds', () => {
    for (const r of risk) {
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(100);
      expect(r.band).toBe(r.score >= 70 ? 'critical' : r.score >= 45 ? 'elevated' : 'healthy');
      expect(r.shadow).toBe(r.confidence < 0.6);
    }
  });

  it('a runtime-only pull-forward never precedes the lead time', () => {
    const gen = by('ast-gen-c')!;
    if (gen.suggestedDate) {
      // suggested must be >= NOW + leadTimeDays (gen-c leadTime 5)
      expect(Date.parse(gen.suggestedDate)).toBeGreaterThanOrEqual(Date.parse(NOW) + 5 * 86_400_000 - 1);
    }
  });

  it('July is rainy season, so plumbing (pump) carries a seasonal contribution', () => {
    expect(seasonOf(NOW)).toBe('rainy');
    const pump = by('ast-pump-d')!;
    expect(pump.drivers.find((d) => d.key === 'season')!.contribution).toBeGreaterThan(0);
  });
});

describe('risk engine — tenant isolation (§8.2, release-blocking)', () => {
  it('a Lekki FM is never scored on the Ikoyi (tenant B) generator', () => {
    const risk = riskForFM();
    expect(risk.find((r) => String(r.assetId) === 'ast-ikoyi-gen')).toBeUndefined();
    expect(risk.every((r) => String(r.assetId).startsWith('ast-'))).toBe(true);
    // tenant B has its own plan+runtime in the seed — proof it was excluded by scope, not absence
    expect(seed.ppmPlans.some((p) => p.tenantId === SEED.tenantB)).toBe(true);
    expect(seed.assetRuntime.some((r) => r.tenantId === SEED.tenantB)).toBe(true);
  });
});
