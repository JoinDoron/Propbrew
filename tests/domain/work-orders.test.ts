import { describe, expect, it } from 'vitest';
import * as seed from '@/server/data/seed/fixtures';
import { slaState, workload, triageSuggestions, costRollup, isOpen } from '@/domain/work-orders';
import { NOW_MS } from '@/domain/ppm';
import type { WorkOrder } from '@/domain/entities';

const A = seed.workOrders[0].tenantId;
const wos = seed.workOrders.filter((w) => w.tenantId === A) as WorkOrder[];

describe('slaState', () => {
  it('flags a past deadline as breached and a future one as ok/soon', () => {
    const past = slaState({ status: 'in_progress', respondDueAt: '2020-01-01T00:00:00Z', resolveDueAt: null }, NOW_MS);
    expect(past.state).toBe('breached');
    const future = slaState({ status: 'in_progress', respondDueAt: '2999-01-01T00:00:00Z', resolveDueAt: null }, NOW_MS);
    expect(future.state).toBe('ok');
    const closed = slaState({ status: 'closed', respondDueAt: '2020-01-01T00:00:00Z', resolveDueAt: null }, NOW_MS);
    expect(closed.state).toBe('none');
  });
});

describe('workload', () => {
  it('counts only open orders per named assignee', () => {
    const loads = workload(wos);
    loads.forEach((l) => expect(l.open).toBeGreaterThan(0));
    // sorted busiest first
    for (let i = 1; i < loads.length; i++) expect(loads[i - 1].open).toBeGreaterThanOrEqual(loads[i].open);
  });
});

describe('triageSuggestions (AI-F-02)', () => {
  it('only suggests for open, un-triaged/unassigned orders and never mutates', () => {
    const before = wos.map((w) => ({ ...w }));
    const t = triageSuggestions(wos);
    t.forEach((s) => {
      const w = wos.find((x) => x.id === s.id)!;
      expect(isOpen(w)).toBe(true);
    });
    // pure: source untouched
    expect(wos).toEqual(before);
  });
});

describe('costRollup', () => {
  it('totals only costed orders and splits by origin', () => {
    const r = costRollup(wos);
    const manual = wos.filter((w) => w.cost && w.cost.minor > 0).reduce((n, w) => n + (w.cost?.minor ?? 0), 0);
    expect(r.totalMinor).toBe(manual);
    expect(r.byOrigin.reduce((n, b) => n + b.minor, 0)).toBe(manual);
  });
});
