import { describe, expect, it } from 'vitest';
import { occupancyStats, revenueModel, vacancyTrend, rentOf } from '@/domain/spaces';

const units = [
  { type: '3-bed apartment', occupancy: 'occupied' },
  { type: '2-bed apartment', occupancy: 'occupied' },
  { type: 'Studio', occupancy: 'vacant' },
  { type: 'Penthouse', occupancy: 'reserved' },
];

describe('occupancyStats', () => {
  it('counts each status and computes the rate', () => {
    const s = occupancyStats(units);
    expect(s.total).toBe(4);
    expect(s.occupied).toBe(2);
    expect(s.vacant).toBe(1);
    expect(s.reserved).toBe(1);
    expect(s.rate).toBe(50);
  });
});

describe('revenueModel', () => {
  it('realized excludes vacant/reserved; vacancy loss is the vacant rent', () => {
    const r = revenueModel(units);
    expect(r.realized).toBe(rentOf('3-bed apartment') + rentOf('2-bed apartment'));
    expect(r.vacancyLoss).toBe(rentOf('Studio'));
    expect(r.capturePct).toBeGreaterThan(0);
    expect(r.capturePct).toBeLessThanOrEqual(100);
  });
});

describe('vacancyTrend', () => {
  it('ends at the current rate and stays within 0–100', () => {
    const t = vacancyTrend(72);
    expect(t[t.length - 1]).toBe(72);
    t.forEach((p) => { expect(p).toBeGreaterThanOrEqual(0); expect(p).toBeLessThanOrEqual(100); });
  });
});
