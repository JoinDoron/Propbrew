import { describe, expect, it } from 'vitest';
import * as seed from '@/server/data/seed/fixtures';
import { periodKpis, occupancyRate, profitByProperty, sourcePerformance, suggestNightlyRate, turnovers, guestProfiles, expenseInsights, cautionExposure } from '@/domain/shortlet/engine';
import { renderTemplate, messageSchedule, whatsappStats, detectConflicts, channelSummary, DEFAULT_TEMPLATES } from '@/domain/shortlet/automation';
import { PLANS, planFor, entitlements, recommendPlan, TEAM_PERMISSIONS } from '@/domain/shortlet/plan';
import { effectiveRate, suggestPriority, issueStats, agentPerformance, reviewStats } from '@/domain/shortlet/operations';
import * as seedAll from '@/server/data/seed/fixtures';
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

describe('WhatsApp automation (FR-WA)', () => {
  const NOW = Date.parse('2026-07-26');
  it('fills template variables from a booking', () => {
    const confirmation = DEFAULT_TEMPLATES.find((t) => t.key === 'confirmation')!;
    const out = renderTemplate(confirmation.body, bookings[0], apts.find((a) => a.id === bookings[0].apartmentId));
    expect(out).not.toContain('{{guest}}');
    expect(out).toContain(bookings[0].guestName.split(' ')[0]);
  });
  it('schedules five messages and counts sent vs scheduled', () => {
    const sched = messageSchedule(bookings[0], NOW);
    expect(sched).toHaveLength(5);
    const stats = whatsappStats(bookings, NOW);
    expect(stats.sent).toBeGreaterThan(0);
    expect(stats.read).toBeLessThanOrEqual(stats.sent);
  });
});

describe('iCal channels (FR-IC)', () => {
  it('summarises connections and detects the seeded double-booking', () => {
    const s = channelSummary(apts);
    expect(s.connections).toBeGreaterThan(0);
    const conflicts = detectConflicts(bookings);
    expect(conflicts.length).toBeGreaterThanOrEqual(1); // Sophia vs Airbnb import on ap-4
    expect(conflicts[0].nights).toBeGreaterThan(0);
  });
});

describe('plans (FR-PL) + team RBAC (FR-TM)', () => {
  it('entitlements are cumulative and premium features gate by tier', () => {
    expect(PLANS).toHaveLength(5);
    expect(entitlements('lite')).not.toContain('WhatsApp automation');
    expect(entitlements('starter')).toContain('WhatsApp automation');
    expect(entitlements('growth')).toContain('iCal channel sync');
    expect(planFor('growth').apartmentCap).toBe(6);
  });
  it('recommends the smallest fitting plan', () => {
    expect(recommendPlan(6, true, true).key).toBe('growth'); // iCal → growth, 6 apts ok
    expect(recommendPlan(2, false, false).key).toBe('lite');
    expect(recommendPlan(10, true, true).key).toBe('pro'); // >6 apts
  });
  it('housekeeper is limited to inspections + calendar; owner has all', () => {
    expect(TEAM_PERMISSIONS.housekeeper.Inspections).toBe('manage');
    expect(TEAM_PERMISSIONS.housekeeper.Financials).toBe('none');
    expect(TEAM_PERMISSIONS.owner['Team & plan']).toBe('manage');
    expect(TEAM_PERMISSIONS.accountant.Financials).toBe('manage');
  });
});

describe('operations: pricing / maintenance / agents / reviews', () => {
  it('applies seasonal pricing rules over the base rate', () => {
    const rules = seedAll.shortletPricingRules;
    const inc = effectiveRate(120_000_00, rules, '2026-12-20'); // ap-3 +25%
    expect(inc.minor).toBe(150_000_00);
    const base = effectiveRate(120_000_00, rules, '2026-08-01'); // no rule
    expect(base.minor).toBe(120_000_00);
  });
  it('suggests issue priority from the title', () => {
    expect(suggestPriority('Water leak under sink')).toBe('urgent');
    expect(suggestPriority('AC not cooling')).toBe('high');
    expect(suggestPriority('Replace bulb')).toBe('low');
    const s = issueStats(seedAll.shortletIssues, Date.parse('2026-07-26'));
    expect(s.open + s.inProgress + s.resolvedThisMonth).toBeGreaterThan(0);
  });
  it('computes agent performance + commission', () => {
    const perf = agentPerformance(seedAll.shortletAgents, bookings);
    const kunle = perf.find((p) => p.agent.name === 'Kunle Bookings');
    expect(kunle?.bookings).toBeGreaterThanOrEqual(1);
    expect(kunle?.commissionMinor).toBe(Math.round((kunle!.revenueMinor * 10) / 100));
  });
  it('aggregates review ratings + distribution', () => {
    const s = reviewStats(seedAll.shortletReviews);
    expect(s.count).toBe(4);
    expect(s.avg).toBeGreaterThan(0);
    expect(s.distribution.reduce((a, b) => a + b, 0)).toBe(s.count);
  });
});
