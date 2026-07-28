import { describe, expect, it } from 'vitest';
import { tenure, paymentReliability, engagementScore, riskFlags, type EngagementInput } from '@/domain/residents';

const NOW = Date.parse('2026-07-26');

describe('tenure', () => {
  it('labels a future move-in and a multi-year resident', () => {
    expect(tenure('2026-08-01', NOW).days).toBeLessThan(0);
    expect(tenure('2023-06-01', NOW).years).toBeGreaterThan(2);
  });
});

describe('paymentReliability', () => {
  it('drops when invoices are late and is 100 with no bills', () => {
    expect(paymentReliability([]).score).toBe(100);
    const mixed = paymentReliability([{ status: 'paid' }, { status: 'overdue' }, { status: 'in_arrears' }]);
    expect(mixed.late).toBe(2);
    expect(mixed.score).toBe(33);
  });
});

describe('engagementScore + flags', () => {
  const base: EngagementInput = { status: 'active', moveInDate: '2023-06-01', balanceOwed: false, bills: [{ status: 'paid' }], requests: [1, 2], bookings: [1] };
  it('scores within 0–100 and rewards tenure + activity', () => {
    const s = engagementScore(base, NOW);
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThanOrEqual(100);
    const inactive = engagementScore({ ...base, requests: [], bookings: [] }, NOW);
    expect(inactive).toBeLessThan(s);
  });
  it('flags arrears and low engagement, never mutates input', () => {
    const arrears: EngagementInput = { ...base, balanceOwed: true, bills: [{ status: 'in_arrears' }, { status: 'escalated' }], requests: [], bookings: [] };
    const before = JSON.stringify(arrears);
    const flags = riskFlags(arrears, NOW);
    expect(flags.some((f) => f.label === 'Outstanding balance')).toBe(true);
    expect(flags.some((f) => f.label === 'Low engagement')).toBe(true);
    expect(JSON.stringify(arrears)).toBe(before);
  });
});
