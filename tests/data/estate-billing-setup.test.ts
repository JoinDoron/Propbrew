import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceRecordState } from '@/server/data/record-context';
import { identityByKey } from '@/server/identities';
import { estateBillingState } from '@/domain/estate/billing-setup';
const b = vi.hoisted(() => ({ actor: vi.fn(), state: null as WorkspaceRecordState | null }));
vi.mock('@/server/session', () => ({ getActor: b.actor }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/server/operating-clock', () => ({ operatingClock: () => ({ dateISO: '2026-03-31', iso: '2026-03-31T12:20:00.000Z', nowMs: Date.parse('2026-03-31T12:20:00Z') }) }));
vi.mock('@/server/data/durable-records', async () => {
  const { runWithRecordContext } = await import('@/server/data/record-context');
  return { withDurableMutation: async (fn: () => unknown) => {
    const before = structuredClone(b.state!); const actor = await b.actor();
    const result = await runWithRecordContext({ state: b.state!, domainTenantId: actor.tenantId, mode: 'write' }, fn);
    if (result && typeof result === 'object' && 'ok' in result && result.ok === false) b.state = before;
    return result;
  } };
});
import { createEstateInvoice, createEstateRecurringCharge, generateDueEstateCharges, setEstateRecurringChargeEnabled, updateEstateRecurringCharge, issueEstateInvoice, updateEstateInvoiceDraft } from '@/server/actions/estate-billing-setup';
const actor = identityByKey('estate_manager').actor;
function invoice() { return { expectedCompanyId: actor.tenantId, idempotencyKey: randomUUID(), residentId: 'resident-own', expectedUnitId: 'unit-own', description: 'Quarterly levy', amount: '12345.67', dueDate: '2026-04-07' }; }
function recurring() { const rest: Record<string, unknown> = { ...invoice() }; delete rest.dueDate; return { ...rest, frequency: 'monthly', startDate: '2026-01-31', endDate: null, dueOffsetDays: 7 }; }
beforeEach(() => {
  b.actor.mockResolvedValue(structuredClone(actor));
  b.state = { schemaVersion: 1, collections: {
    sites: [{ tenantId: actor.tenantId, id: actor.estateIds[0], kind: 'estate', name: 'Estate own' }],
    units: [{ tenantId: actor.tenantId, id: 'unit-own', siteId: actor.estateIds[0], occupancy: 'occupied', label: 'Unit 1' }],
    residents: [{ tenantId: actor.tenantId, id: 'resident-own', userId: 'resident-account', name: 'Resident own', unitId: 'unit-own', siteId: actor.estateIds[0], status: 'active' }], invoices: [],
  }, auxiliary: {}, history: {}, sequences: {} };
});
describe('Estate invoice and recurring-charge action boundaries', () => {
  it('creates one exact draft and replays the same submission without duplicating it', async () => {
    const input = invoice(); const first = await createEstateInvoice(input); expect(first.ok).toBe(true);
    expect(await createEstateInvoice(input)).toMatchObject({ ok: true, id: first.ok ? first.id : '' });
    expect(b.state!.collections.invoices).toHaveLength(1);
    expect((b.state!.collections.invoices as Record<string, unknown>[])[0]).toMatchObject({ amount: { minor: 1234567, currency: 'NGN' }, paid: { minor: 0, currency: 'NGN' }, status: 'draft' });
    expect(await createEstateInvoice({ ...input, amount: '999' })).toMatchObject({ ok: false });
    expect(b.state!.collections.invoices).toHaveLength(1);
  });
  it('blocks stale company forms and invisible, inactive or unoccupied residents', async () => {
    const original = structuredClone(b.state);
    expect(await createEstateInvoice({ ...invoice(), expectedCompanyId: 'foreign-company' })).toMatchObject({ ok: false });
    expect(b.state).toEqual(original);
    expect(await createEstateInvoice({ ...invoice(), residentId: 'foreign-resident' })).toMatchObject({ ok: false });
    expect(b.state).toEqual(original);
    (b.state!.collections.units as Record<string, unknown>[])[0].occupancy = 'vacant';
    expect(await createEstateInvoice(invoice())).toMatchObject({ ok: false });
  });
  it('does not permit read-only managers or ownership/currency injection', async () => {
    b.actor.mockResolvedValue(identityByKey('executive').actor);
    expect(await createEstateInvoice(invoice())).toMatchObject({ ok: false });
    b.actor.mockResolvedValue(actor);
    for (const input of [{ ...invoice(), tenantId: 'foreign' }, { ...invoice(), currency: 'USD' }, { ...invoice(), amount: '1.001' }, { ...invoice(), dueDate: '2026-02-31' }]) expect(await createEstateInvoice(input)).toMatchObject({ ok: false });
    expect(b.state!.collections.invoices).toHaveLength(0);
  });
  it('generates recurring drafts once, pauses and resumes without back-billing paused dates', async () => {
    const result = await createEstateRecurringCharge(recurring()); expect(result.ok).toBe(true);
    expect(await generateDueEstateCharges({ expectedCompanyId: actor.tenantId })).toMatchObject({ ok: true, created: 3 });
    expect(await generateDueEstateCharges({ expectedCompanyId: actor.tenantId })).toMatchObject({ ok: true, created: 0 });
    const rule = estateBillingState(b.state!, actor.tenantId!).rules[0];
    expect(await setEstateRecurringChargeEnabled({ expectedCompanyId: actor.tenantId, ruleId: rule.id, expectedVersion: rule.version, enabled: false })).toMatchObject({ ok: true });
    expect(rule.enabled).toBe(false);
    expect(await setEstateRecurringChargeEnabled({ expectedCompanyId: actor.tenantId, ruleId: rule.id, expectedVersion: 1, enabled: true })).toMatchObject({ ok: false });
    expect(await setEstateRecurringChargeEnabled({ expectedCompanyId: actor.tenantId, ruleId: rule.id, expectedVersion: rule.version, enabled: true })).toMatchObject({ ok: true });
    expect((b.state!.collections.invoices as unknown[])).toHaveLength(3);
  });
  it('edits only ungenerated future terms and preserves existing invoice amounts', async () => {
    await createEstateRecurringCharge(recurring()); const rule = estateBillingState(b.state!, actor.tenantId!).rules[0];
    const change = { expectedCompanyId: actor.tenantId, ruleId: rule.id, expectedVersion: rule.version, description: 'Updated levy', amount: '20.50', endDate: null, dueOffsetDays: 10 };
    expect(await updateEstateRecurringCharge(change)).toMatchObject({ ok: false });
    await generateDueEstateCharges({ expectedCompanyId: actor.tenantId });
    const before = structuredClone(b.state!.collections.invoices);
    expect(await updateEstateRecurringCharge(change)).toMatchObject({ ok: true });
    expect(b.state!.collections.invoices).toEqual(before);
    expect(estateBillingState(b.state!, actor.tenantId!).rules[0].amountMinor).toBe(2050);
  });
  it('edits an unpaid draft idempotently and rejects stale snapshots and issued changes', async () => {
    const result = await createEstateInvoice(invoice()); if (!result.ok) throw new Error('Fixture creation failed');
    const row = (b.state!.collections.invoices as { id: string; description: string; amount: { minor: number }; dueDate: string }[])[0];
    const edit = { expectedCompanyId: actor.tenantId, invoiceId: result.id, idempotencyKey: randomUUID(), expectedSnapshot: JSON.stringify([row.description, row.amount.minor, row.dueDate]), description: 'Reviewed levy', amount: '88.75', dueDate: '2026-04-10' };
    expect(await updateEstateInvoiceDraft(edit)).toMatchObject({ ok: true });
    expect(await updateEstateInvoiceDraft(edit)).toMatchObject({ ok: true });
    expect((b.state!.collections.invoices as typeof row[])[0]).toMatchObject({ description: 'Reviewed levy', amount: { minor: 8875 }, dueDate: '2026-04-10' });
    expect(await updateEstateInvoiceDraft({ ...edit, idempotencyKey: randomUUID(), amount: '55' })).toMatchObject({ ok: false });
    expect(await issueEstateInvoice({ expectedCompanyId: actor.tenantId, invoiceId: result.id })).toMatchObject({ ok: true });
    expect(await updateEstateInvoiceDraft({ ...edit, idempotencyKey: randomUUID() })).toMatchObject({ ok: false });
  });
  it('rejects a stale form after the resident moves to another unit in the same company', async () => {
    const input = invoice();
    const units = b.state!.collections.units as Record<string, unknown>[];
    units.push({ ...units[0], id: 'unit-new' });
    (b.state!.collections.residents as Record<string, unknown>[])[0].unitId = 'unit-new';
    expect(await createEstateInvoice(input)).toMatchObject({ ok: false });
    expect(await createEstateRecurringCharge(recurring())).toMatchObject({ ok: false });
    expect(b.state!.collections.invoices).toHaveLength(0);
  });
  it('issues a valid draft only after explicit scoped review and refuses a moved resident', async () => {
    const result = await createEstateInvoice(invoice()); if (!result.ok) throw new Error('Fixture creation failed');
    expect(await issueEstateInvoice({ expectedCompanyId: 'foreign-company', invoiceId: result.id })).toMatchObject({ ok: false });
    expect(await issueEstateInvoice({ expectedCompanyId: actor.tenantId, invoiceId: result.id })).toMatchObject({ ok: true });
    expect((b.state!.collections.invoices as Record<string, unknown>[])[0].status).toBe('issued');
    const second = await createEstateInvoice(invoice()); if (!second.ok) throw new Error('Fixture creation failed');
    (b.state!.collections.residents as Record<string, unknown>[])[0].status = 'moved_out';
    expect(await issueEstateInvoice({ expectedCompanyId: actor.tenantId, invoiceId: second.id })).toMatchObject({ ok: false });
    expect((b.state!.collections.invoices as Record<string, unknown>[])[1].status).toBe('draft');
  });
});
