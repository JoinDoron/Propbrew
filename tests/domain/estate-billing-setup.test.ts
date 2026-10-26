import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { billableResident, billingDate, estateBillingState, MAX_RECURRING_CATCHUP, nairaToKobo, processDueEstateCharges, recurringCycleDate, type EstateRecurringRule } from '@/domain/estate/billing-setup';
import type { WorkspaceRecordState } from '@/server/data/record-context';
const company = 'company-a', other = 'company-b';
function state(): WorkspaceRecordState { return { schemaVersion: 1, collections: {
  sites: [{ id: 'estate-a', tenantId: company, kind: 'estate', name: 'Lagos Court' }],
  units: [{ id: 'unit-a', tenantId: company, siteId: 'estate-a', label: 'Unit 1', occupancy: 'occupied' }],
  residents: [{ id: 'resident-a', tenantId: company, siteId: 'estate-a', unitId: 'unit-a', userId: 'account-a', name: 'Ada Okafor', status: 'active' }], invoices: [],
}, auxiliary: {}, history: {}, sequences: {} }; }
function rule(overrides: Partial<EstateRecurringRule> = {}): EstateRecurringRule { return {
  id: randomUUID(), tenantId: company, estateId: 'estate-a', residentId: 'resident-a', unitId: 'unit-a', ownerUserId: 'account-a', description: 'Service charge', amountMinor: 2500050, currency: 'NGN', frequency: 'monthly',
  startDate: '2026-01-31', endDate: null, dueOffsetDays: 7, enabled: true, nextCycleIndex: 0, version: 1, createdBy: 'manager', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', ...overrides,
}; }
const actor = { id: 'system:estate-recurring', name: 'Recurring scheduler', role: 'system_timer', at: '2026-03-31T12:15:00.000Z' };
function configured(overrides: Partial<EstateRecurringRule> = {}) { const s = state(), r = rule(overrides); estateBillingState(s, company, true).rules.push(r); return { s, r }; }
describe('Exact Nigerian invoice money and real calendar cycles', () => {
  it.each([['0.01', 1], ['25000.50', 2500050], ['1', 100], [' 12.3 ', 1230], ['9999999999999.99', 999999999999999]])('parses%s without rounding', (text, minor) => expect(nairaToKobo(text)).toBe(minor));
  it.each(['0', '-1', '1.005', '1e3', '1,000', 'NaN', '', '001', '10000000000000', 'Infinity'])('rejects ambiguous or excessive%s', (text) => expect(nairaToKobo(text)).toBeNull());
  it.each(['2026-02-29', '2026-04-31', '2026-99-01', '2026-00-10', '2026-1-1'])('rejects nonexistent dates%s safely', (text) => expect(billingDate.safeParse(text).success).toBe(false));
  it('keeps month-end and leap-year anchors without drift', () => {
    expect([0, 1, 2, 3].map((i) => recurringCycleDate(rule(), i))).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
    expect(recurringCycleDate(rule({ frequency: 'yearly', startDate: '2024-02-29' }), 4)).toBe('2028-02-29');
    expect(recurringCycleDate(rule({ frequency: 'quarterly' }), 1)).toBe('2026-04-30');
  });
});
describe('Recurring charge draft projection', () => {
  it('creates exact drafts with resident binding, preserved balances and real audit attribution', () => {
    const { s, r } = configured(); const result = processDueEstateCharges(s, company, '2026-03-31', actor);
    expect(result).toEqual({ created: 3, remainingDue: 0, skipped: 0 });
    const invoices = s.collections.invoices as Record<string, unknown>[];
    expect(invoices.map((row) => row.dueDate)).toEqual(['2026-02-07', '2026-03-07', '2026-04-07']);
    for (const invoice of invoices) { expect(invoice).toMatchObject({ tenantId: company, status: 'draft', ownerUserId: 'account-a', residentName: 'Ada Okafor', amount: { minor: 2500050, currency: 'NGN' }, paid: { minor: 0, currency: 'NGN' } }); }
    expect(r.nextCycleIndex).toBe(3); expect(r.updatedAt).toBe(actor.at);
    const history = Object.values(s.history).flat() as Record<string, unknown>[];
    expect(history).toHaveLength(3); expect(history.every((row) => row.at === actor.at && row.actorRole === 'system_timer' && row.event === 'CREATE')).toBe(true);
  });
  it('does not duplicate a cycle on replay, even when its stored cursor is retried', () => {
    const { s, r } = configured(); processDueEstateCharges(s, company, '2026-03-31', actor);
    expect(processDueEstateCharges(s, company, '2026-03-31', actor).created).toBe(0);
    r.nextCycleIndex = 0;
    expect(processDueEstateCharges(s, company, '2026-03-31', actor).created).toBe(0);
    expect(s.collections.invoices).toHaveLength(3); expect(r.nextCycleIndex).toBe(3);
  });
  it('caps backlog safely and reports remaining work instead of dropping it', () => {
    const { s } = configured({ startDate: '2020-01-31' });
    expect(processDueEstateCharges(s, company, '2026-03-31', actor)).toMatchObject({ created: MAX_RECURRING_CATCHUP, remainingDue: 1 });
    expect(processDueEstateCharges(s, company, '2026-03-31', actor)).toMatchObject({ created: MAX_RECURRING_CATCHUP, remainingDue: 1 });
    expect(s.collections.invoices).toHaveLength(48);
  });
  it('honours inclusive schedule end and paused schedules', () => {
    const { s } = configured({ endDate: '2026-02-28' }); processDueEstateCharges(s, company, '2026-03-31', actor);
    expect(s.collections.invoices).toHaveLength(2);
    const paused = configured({ enabled: false }); expect(processDueEstateCharges(paused.s, company, '2026-03-31', actor).created).toBe(0);
  });
  it('preserves scope and stops when the bound resident moves or leaves', () => {
    const { s } = configured(); expect(processDueEstateCharges(s, company, '2026-03-31', { ...actor, estateIds: [] }).created).toBe(0);
    (s.collections.residents as Record<string, unknown>[])[0].unitId = 'another-unit';
    expect(processDueEstateCharges(s, company, '2026-03-31', actor)).toEqual({ created: 0, remainingDue: 0, skipped: 1 });
    expect(s.collections.invoices).toHaveLength(0);
    expect(billableResident(s, other, 'resident-a')).toBeNull();
  });
  it('refuses foreign billing envelopes instead of using them as authority', () => {
    const { s } = configured(); expect(() => processDueEstateCharges(s, other, '2026-03-31', actor)).toThrow('another company');
    expect(s.collections.invoices).toHaveLength(0);
  });
});
