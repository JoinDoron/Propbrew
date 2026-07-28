import { describe, expect, it } from 'vitest';
import * as seed from '@/server/data/seed/fixtures';
import { periodKpis, occupancyRate, profitByProperty, sourcePerformance, suggestNightlyRate, turnovers, guestProfiles, expenseInsights, cautionExposure } from '@/domain/shortlet/engine';
import type { Apartment, SlBooking, SlExpense } from '@/domain/shortlet/types';

const apts = seed.shortletApartments as Apartment[];
const bookings = seed.shortletBookings as SlBooking[];
const expenses = seed.shortletExpenses as SlExpense[];
const JULY = Date.UTC(2026, 6, 1);
const AUG = Date.UTC(2026, 7, 1);

describe('KPIs + occupancy', () => {
  it('computes revenue, expense, profit and occupancy for July', () => {
    const k = periodKpis(apts, bookings, expenses, JULY, AUG);
    expect(k.revenueMinor).toBeGreaterThan(0);
    expect(k.expenseMinor).toBeGreaterThan(0);
    expect(k.profitMinor).toBe(k.revenueMinor - k.expenseMinor);
    expect(k.occupancyPct).toBeGreaterThanOrEqual(0);
    expect(k.occupancyPct).toBeLessThanOrEqual(100);
    expect(k.cautionHeldMinor).toBeGreaterThan(0);
  });
  it('occupancy is nights-sold ÷ available and bounded', () => {
    const occ = occupancyRate(bookings, 'ap-1', JULY, AUG);
    expect(occ).toBeGreaterThan(0);
    expect(occ).toBeLessThanOrEqual(100);
  });
});

describe('analytics', () => {
  it('ranks property profit and source performance', () => {
    const pp = profitByProperty(seed.shortletProperties as never, bookings, expenses);
    expect(pp.length).toBe(2);
    expect(pp[0].profitMinor).toBeGreaterThanOrEqual(pp[1].profitMinor);
    const src = sourcePerformance(bookings);
    expect(src.reduce((n, s) => n + s.bookings, 0)).toBeGreaterThan(0);
  });
});

describe('smart features', () => {
  it('suggests an advisory weekend/high-demand rate above base', () => {
    const s = suggestNightlyRate(apts[0], '2026-12-26', 90); // Saturday, December, high demand
    expect(s.suggestedMinor).toBeGreaterThan(apts[0].nightlyRate.minor);
    expect(s.reasons.length).toBeGreaterThan(0);
  });
  it('flags same-day turnover flips', () => {
    const t = turnovers(bookings, Date.parse('2026-07-26'), 30);
    expect(Array.isArray(t)).toBe(true);
    expect(t.every((x) => x.gapDays === null || x.gapDays >= 0)).toBe(true);
  });
  it('recognises repeat/VIP guests', () => {
    const g = guestProfiles(bookings);
    const chidinma = g.find((x) => x.name === 'Chidinma Eze');
    expect(chidinma?.stays).toBeGreaterThanOrEqual(3);
    expect(chidinma?.vip).toBe(true);
  });
  it('surfaces diesel as a share of revenue', () => {
    const ins = expenseInsights(bookings, expenses);
    expect(ins.dieselMinor).toBeGreaterThan(0);
    expect(ins.dieselPctOfRevenue).toBeGreaterThan(0);
    expect(ins.byCategory[0].pct).toBeGreaterThanOrEqual(ins.byCategory[ins.byCategory.length - 1].pct);
  });
  it('tracks caution-fee exposure', () => {
    const c = cautionExposure(bookings);
    expect(c.heldMinor).toBeGreaterThan(0);
    expect(c.deductedMinor).toBeGreaterThan(0); // Emeka partial deduction
  });
});
