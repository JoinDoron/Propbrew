import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { complianceDateValid, complianceObligationFields } from '@/domain/facility/compliance';
import { complianceState, daysUntil, addDaysISO } from '@/domain/inspections';

const input = () => ({ expectedCompanyId: randomUUID(), idempotencyKey: randomUUID(), siteId: 'actual-site', assetId: null, name: 'Water quality operational review', scopeLabel: 'Main water system', criticality: 'important', cadenceDays: 30, templateKey: 'water', templateName: 'Water system check', checklist: [{ id: 'visual', label: 'Review recorded condition', severity: 'major', requiresPhoto: true }], authority: '', certificateReference: '', validUntil: null, nextDueDate: '2026-10-26' });
describe('Facility compliance input boundaries', () => {
  it.each(['2026-02-30', '2026-13-01', '2026-1-01', '2025-02-29', '1899-12-31', '2101-01-01', 'invalid'])('rejects impossible or unsupported date %s', (date) => expect(complianceDateValid(date)).toBe(false));
  it.each(['1900-01-01', '2024-02-29', '2026-10-26', '2100-12-31'])('accepts real supported date %s', (date) => expect(complianceDateValid(date)).toBe(true));
  it('requires a certificate reference to record expiry while allowing an uncertified operational obligation', () => {
    expect(complianceObligationFields.safeParse(input()).success).toBe(true);
    expect(complianceObligationFields.safeParse({ ...input(), validUntil: '2026-12-31' }).success).toBe(false);
    expect(complianceObligationFields.safeParse({ ...input(), validUntil: '2026-12-31', certificateReference: 'EXTERNAL-CERTIFICATE-REF' }).success).toBe(true);
  });
  it.each([{ cadenceDays: 0 }, { cadenceDays: 1.5 }, { cadenceDays: 3651 }, { checklist: [] }, { nextDueDate: '2026-02-30' }, { templateKey: 'unknown' }, { name: 'Name\u0000' }, { idempotencyKey: 'not-a-key' }, { tenantId: 'forged' }, { legalApproval: true }])('rejects invalid authority, cadence, dates or checklist %j', (change) => expect(complianceObligationFields.safeParse({ ...input(), ...change }).success).toBe(false));
  it('rejects duplicate checklist identifiers and permits distinct complete checks', () => {
    const value = input(); expect(complianceObligationFields.safeParse({ ...value, checklist: [...value.checklist, ...value.checklist] }).success).toBe(false);
    expect(complianceObligationFields.safeParse({ ...value, checklist: [...value.checklist, { ...value.checklist[0], id: 'other' }] }).success).toBe(true);
  });
  it('evaluates recorded expiry against the supplied company operating day and crosses calendar boundaries correctly', () => {
    const current = Date.parse('2026-10-26T00:00:00Z');
    expect(complianceState('2026-10-25', current)).toBe('expired'); expect(complianceState('2026-10-26', current)).toBe('expiring');
    expect(daysUntil('2026-11-25', current)).toBe(30); expect(complianceState('2026-11-26', current)).toBe('valid');
    expect(complianceState(null, current)).toBe('never'); expect(addDaysISO('2026-12-20', 30)).toBe('2027-01-19');
  });
});
