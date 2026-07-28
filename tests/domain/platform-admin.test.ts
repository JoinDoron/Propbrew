import { describe, expect, it } from 'vitest';
import { planFor, tenantHealth, aiUsage, isSecurityEvent, isFinancialEvent } from '@/domain/platform-admin';

describe('planFor', () => {
  it('tiers by unit count with a positive MRR', () => {
    expect(planFor(300).plan).toBe('Enterprise');
    expect(planFor(120).plan).toBe('Growth');
    expect(planFor(40).plan).toBe('Starter');
    expect(planFor(120).mrrMinor).toBeGreaterThan(planFor(40).mrrMinor);
  });
});

describe('tenantHealth', () => {
  it('rewards adoption, penalises open work + suspensions, stays 0–100', () => {
    const healthy = tenantHealth({ units: 240, users: 20, activeUsers: 20, suspendedUsers: 0, openWorkOrders: 1, totalWorkOrders: 10, overdueInvoices: 0 });
    const poor = tenantHealth({ units: 240, users: 20, activeUsers: 8, suspendedUsers: 3, openWorkOrders: 9, totalWorkOrders: 10, overdueInvoices: 40 });
    expect(healthy.score).toBeGreaterThan(poor.score);
    [healthy, poor].forEach((h) => { expect(h.score).toBeGreaterThanOrEqual(0); expect(h.score).toBeLessThanOrEqual(100); });
  });
});

describe('aiUsage', () => {
  it('costs calls and reports cap utilisation', () => {
    const u = aiUsage(5000, 60_000_000);
    expect(u.costMinor).toBe(5000 * 8000);
    expect(u.capPct).toBeGreaterThan(0);
    expect(u.capPct).toBeLessThanOrEqual(100);
  });
});

describe('event classification', () => {
  it('flags security and financial events', () => {
    expect(isSecurityEvent('sos-event', 'RAISE')).toBe(true);
    expect(isSecurityEvent('booking', 'CONFIRM')).toBe(false);
    expect(isFinancialEvent('service-charge', 'PAYMENT_CONFIRMED')).toBe(true);
    expect(isFinancialEvent('booking', 'CONFIRM')).toBe(false);
  });
});
