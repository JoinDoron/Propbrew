import { describe, expect, it } from 'vitest';
import * as seed from '@/server/data/seed/fixtures';
import {
  projectEVM, costCodesEVM, projectActualMinor, criticalPath, taskDurationDays,
  scoreQuotes, budgetException, materialLeakage, scanRisks, portfolioConfidence,
  weeklyDigest, slipPropagation, moneySCurve, projectEVMOf, recoveryPlan, zoneProgress, activeLevel,
  scoreSubcontractors, safetyStats, permitClashes, askConstruction, suggestedQuestions, type ConWorld,
} from '@/domain/construction/engine';

const NOW = Date.parse('2026-07-26');

const world = (): ConWorld => ({
  projects: seed.constructionProjects, phases: seed.constructionPhases, tasks: seed.constructionTasks, costCodes: seed.constructionCostCodes,
  pos: seed.constructionOrders, requests: seed.constructionRequests, reports: seed.constructionReports,
  materials: seed.constructionMaterials, stock: seed.constructionStock, movements: seed.constructionMovements,
  rfis: seed.constructionRfis, workers: seed.constructionWorkers, issues: seed.constructionIssues,
  milestones: seed.constructionMilestones, attendance: seed.constructionAttendance,
  zones: seed.constructionZones, subcontractors: seed.constructionSubcontractors,
  safetyEvents: seed.constructionSafetyEvents, safetyPermits: seed.constructionSafetyPermits, toolboxTalks: seed.constructionToolboxTalks,
});
const marina = () => seed.constructionProjects.find((p) => p.id === 'cp-marina')!;

describe('earned value', () => {
  it('computes CPI/SPI/EAC/VAC for a behind-and-over project', () => {
    const ac = projectActualMinor('cp-marina', seed.constructionCostCodes); // 1,580m
    const evm = projectEVM(marina(), ac);
    expect(evm.spi).toBe(0.8); // earned 36% vs planned 45%
    expect(evm.cpi).toBe(0.96); // earned < spent
    expect(evm.eac).toBeGreaterThan(evm.bac); // forecast overrun
    expect(evm.vac).toBeLessThan(0);
    expect(evm.scheduleBand).toBe('danger');
  });
  it('rolls cost codes into an EVM and draws a money S-curve', () => {
    const codes = seed.constructionCostCodes.filter((c) => c.projectId === 'cp-marina');
    expect(costCodesEVM(codes).cpi).toBeLessThan(1);
    const curve = moneySCurve(projectEVMOf(marina(), seed.constructionCostCodes), 0.45);
    expect(curve[curve.length - 1].pv).toBe(projectEVMOf(marina(), seed.constructionCostCodes).bac); // planned reaches BAC
    expect(curve[0].pv).toBeLessThan(curve[curve.length - 1].pv); // monotone up
  });
});

describe('critical path (CPM)', () => {
  it('finds the zero-float critical chain over the dependency DAG', () => {
    const tasks = seed.constructionTasks.filter((t) => t.projectId === 'cp-marina');
    const cpm = criticalPath(tasks.map((t) => ({ id: t.id, durationDays: taskDurationDays(t), dependsOn: t.dependsOn })));
    expect(cpm.durationDays).toBe(101); // m1→m2→m3→m4→m6
    expect(cpm.critical.has('tk-m4')).toBe(true);
    expect(cpm.critical.has('tk-m6')).toBe(true);
    expect(cpm.critical.has('tk-m5')).toBe(false); // blockwork has float
    expect(cpm.slack.get('tk-m5')).toBe(5);
  });
  it('propagates a slip to downstream tasks', () => {
    const affected = slipPropagation(seed.constructionTasks, 'tk-m3', 5);
    expect(affected.taskIds).toEqual(expect.arrayContaining(['tk-m4', 'tk-m5', 'tk-m6', 'tk-m7']));
  });
});

describe('procurement + budget', () => {
  it('scores and ranks bids, recommending the top score', () => {
    const scored = scoreQuotes(seed.constructionRfqs[0].quotes);
    expect(scored).toHaveLength(3);
    expect(scored[0].score).toBeGreaterThanOrEqual(scored[1].score);
    expect(scored[0].recommended).toBe(true);
    expect(scored[0].quote.vendorId).toBe('v-blockmasters'); // cheapest wins on the weighted score
  });
  it('flags a purchase request that breaches its cost code budget', () => {
    const craneHire = seed.constructionRequests.find((r) => r.id === 'pr-m2')!; // MAR-PRE, ₦48m
    expect(budgetException(craneHire, seed.constructionCostCodes).exception).toBe(true);
  });
});

describe('materials leakage', () => {
  it('detects unaccounted material (received − issued − on-hand)', () => {
    const leak = materialLeakage('mat-rebar', seed.constructionMovements, 5); // received 60, issued 48, on-hand 5
    expect(leak.leakageQty).toBe(7);
    expect(leak.leakagePct).toBe(12);
    expect(leak.anomalous).toBe(true);
  });
});

describe('risk radar', () => {
  it('scans the world and emits the expected advisory signals', () => {
    const kinds = new Set(scanRisks(world(), NOW).map((s) => s.kind));
    for (const k of ['schedule_slip', 'cost_overrun', 'procurement_late', 'low_stock', 'overdue_rfi', 'cert_expiry', 'material_leakage']) {
      expect(kinds.has(k as never)).toBe(true);
    }
  });
  it('ranks by naira-at-risk × severity and rolls up portfolio confidence', () => {
    const signals = scanRisks(world(), NOW);
    expect(signals.length).toBeGreaterThan(3);
    const conf = portfolioConfidence(seed.constructionProjects, seed.constructionCostCodes, signals);
    expect(conf.score).toBeGreaterThanOrEqual(0);
    expect(conf.score).toBeLessThanOrEqual(100);
    expect(conf.nairaAtRiskMinor).toBeGreaterThan(0);
  });
});

describe('weekly digest', () => {
  it('compiles source-linked sections and honest coverage gaps', () => {
    const d = weeklyDigest(marina(), world(), NOW);
    expect(d.sections).toHaveLength(4);
    expect(d.sections.every((s) => Array.isArray(s.sources))).toBe(true);
    expect(d.coverageGaps.length).toBeGreaterThan(0); // 07-25 report is only 'submitted', not approved
  });
});

describe('what-if simulator', () => {
  it('buys back days cheapest-first from the critical chain only', () => {
    const tasks = seed.constructionTasks.filter((t) => t.projectId === 'cp-marina');
    const cpm = criticalPath(tasks.map((t) => ({ id: t.id, durationDays: taskDurationDays(t), dependsOn: t.dependsOn })));
    const plan = recoveryPlan(tasks, cpm.critical, 8);
    // cheapest crashable critical tasks first: tk-m6 (₦1.5m/d, 4d) then tk-m2 (₦1.8m/d)
    expect(plan.crashes[0].taskId).toBe('tk-m6');
    expect(plan.crashes[1].taskId).toBe('tk-m2');
    expect(plan.daysRecovered).toBe(8);
    expect(plan.extraCostMinor).toBe(4 * 150_000_000 + 4 * 180_000_000); // ₦13.2m
    expect(plan.shortfallDays).toBe(0);
    // non-critical blockwork is never crashed — shortening it wouldn't move the finish
    expect(plan.crashes.some((c) => c.taskId === 'tk-m5')).toBe(false);
  });
  it('reports a shortfall when the target exceeds what can be crashed', () => {
    const tasks = seed.constructionTasks.filter((t) => t.projectId === 'cp-marina');
    const cpm = criticalPath(tasks.map((t) => ({ id: t.id, durationDays: taskDurationDays(t), dependsOn: t.dependsOn })));
    expect(recoveryPlan(tasks, cpm.critical, 60).shortfallDays).toBeGreaterThan(0);
  });
});

describe('site twin', () => {
  it('weights the construction sequence and finds the active level', () => {
    const l4 = seed.constructionZones.find((z) => z.id === 'z-m-l4')!;
    expect(zoneProgress(l4)).toBe(32); // structure 80% × 0.4
    expect(zoneProgress(seed.constructionZones.find((z) => z.id === 'z-m-l1')!)).toBe(85);
    expect(activeLevel(seed.constructionZones.filter((z) => z.projectId === 'cp-marina'))).toBe(4);
  });
});

describe('subcontractor league', () => {
  it('ranks on delivery, quality and safety with a transparent composite', () => {
    const league = scoreSubcontractors(seed.constructionSubcontractors);
    expect(league[0].sub.name).toBe('GlazePro Facades'); // perfect delivery, no defects, no incidents
    expect(league[0].rank).toBe(1);
    const worst = league[league.length - 1];
    expect(worst.sub.name).toBe('Lagos Groundworks'); // 7/12 on time, 5 defects, 2 incidents
    expect(worst.band).toBe('danger');
  });
});

describe('safety', () => {
  it('scores posture and flags lapsed permits + location clashes', () => {
    const s = safetyStats(seed.constructionSafetyEvents, seed.constructionSafetyPermits, seed.constructionToolboxTalks, NOW);
    expect(s.daysSinceLTI).toBe(45); // 2026-06-11 → 2026-07-26
    expect(s.expiredPermits).toBe(1); // PTW-9098 ran to 07-24 but is still active
    expect(s.nearMisses).toBe(2);
    const clashes = permitClashes(seed.constructionSafetyPermits);
    expect(clashes).toHaveLength(1); // hot work + work at height, same place, same window
    expect(clashes[0].a.ref).toBe('PTW-9101');
  });
});

describe('construction copilot', () => {
  it('answers from records with citations, and refuses what it cannot ground', () => {
    const behind = askConstruction('which projects are behind schedule?', world(), NOW);
    expect(behind.grounded).toBe(true);
    expect(behind.answer).toContain('Marina Heights');
    expect(behind.sources.length).toBeGreaterThan(0);
    const cost = askConstruction('are we over budget?', world(), NOW);
    expect(cost.answer).toMatch(/over/);
    const nonsense = askConstruction('what is the capital of France?', world(), NOW);
    expect(nonsense.grounded).toBe(false);
    expect(suggestedQuestions(world(), NOW).length).toBeGreaterThan(0);
  });
});
