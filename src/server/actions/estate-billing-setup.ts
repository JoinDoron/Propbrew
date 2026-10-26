'use server';

import { createHash, randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { Invoice, Resident } from '@/domain/entities';
import { appendInvoiceCreation, billableResident, billingDate, billingText, estateBillingState, existingNgnInvoiceTotal, frequencySchema, nairaToKobo, nextEstateInvoiceReference, nextRuleDate, processDueEstateCharges, recurringCycleDate, type EstateRecurringRule } from '@/domain/estate/billing-setup';
import { assertCan, matchesScope, type Actor, type Action } from '@/lib/authz';
import { getActor } from '@/server/session';
import { currentRecordContext } from '@/server/data/record-context';
import { withDurableMutation } from '@/server/data/durable-records';
import { issueInvoice } from '@/server/actions/transitions';
import { operatingClock } from '@/server/operating-clock';

export type EstateBillingResult = { ok: true; id?: string; message: string; created?: number; remainingDue?: number; skipped?: number } | { ok: false; error: string };
const amount = z.string().max(20).refine((value) => nairaToKobo(value) !== null, 'Enter a positive naira amount with at most two decimal places.');
const binding = { expectedCompanyId: z.string().min(1).max(160), idempotencyKey: z.uuid() };
const invoiceInput = z.strictObject({ ...binding, residentId: z.string().min(1).max(160), expectedUnitId: z.string().min(1).max(160), description: billingText, amount, dueDate: billingDate });
const recurringInput = z.strictObject({ ...binding, residentId: z.string().min(1).max(160), expectedUnitId: z.string().min(1).max(160), description: billingText, amount,
  frequency: frequencySchema, startDate: billingDate, endDate: billingDate.nullable(), dueOffsetDays: z.number().int().min(0).max(90),
}).refine((value) => !value.endDate || value.endDate >= value.startDate, 'The end date must be on or after the first cycle.');
const updateInput = z.strictObject({ expectedCompanyId: binding.expectedCompanyId, ruleId: z.uuid(), expectedVersion: z.number().int().positive(), description: billingText, amount, endDate: billingDate.nullable(), dueOffsetDays: z.number().int().min(0).max(90) });
const hash = (input: unknown) => createHash('sha256').update(JSON.stringify(input)).digest('hex');
const refresh = () => ['/billing', '/collections', '/estate', '/portal/bills', '/reports', '/portfolio', '/estate/copilot'].forEach((path) => revalidatePath(path));
function checked(actor: Actor, expectedCompanyId: string, action: Action = 'create') {
  const context = currentRecordContext();
  if (!context || context.mode !== 'write' || !actor.tenantId || actor.tenantId !== expectedCompanyId || context.domainTenantId !== actor.tenantId) throw new Error('Your company changed. Reopen Billing in the company you want to update.');
  const scope = assertCan(actor, 'charges_invoicing', action);
  return { context, scope, tenantId: actor.tenantId, data: estateBillingState(context.state, actor.tenantId, true) };
}
function recipient(actor: Actor, residentId: string, expectedUnitId: string, state: NonNullable<ReturnType<typeof currentRecordContext>>['state']) {
  const found = billableResident(state, actor.tenantId!, residentId);
  if (!found || String(found.unit.id) !== expectedUnitId || !matchesScope({ ...found.resident, estateId: found.site.id }, assertCan(actor, 'charges_invoicing', 'create'))) throw new Error('Choose an active or invited resident in an occupied or reserved unit in your estate scope.');
  return found;
}
function attributed(actor: Actor) { return { id: actor.userId, name: currentRecordContext()?.companyPrincipal?.user.name ?? 'Estate manager', role: 'estate_manager', at: operatingClock().iso }; }
function replay(data: ReturnType<typeof estateBillingState>, actor: Actor, key: string, kind: string, digest: string) {
  const receipt = data.receipts.find((row) => row.actorId === actor.userId && row.key === key);
  if (receipt && (receipt.hash !== digest || receipt.kind !== kind)) throw new Error('This submission key was used for different details. Start a new form.');
  return receipt;
}
function billingFailure(error: unknown): EstateBillingResult {
  const message = error instanceof Error ? error.message : '';
  return { ok: false, error: /^(Your company changed|Choose an active|This submission key|This recurring charge|Invoice totals|Catch up|A paused|Pause the|The end date)/.test(message) ? message : 'This billing change could not be saved. Check your company permissions and form details.' };
}
export async function createEstateInvoice(input: unknown): Promise<EstateBillingResult> {
  return withDurableMutation(async () => {
  const parsed = invoiceInput.safeParse(input); if (!parsed.success) return { ok: false, error: 'Enter a resident, charge description, positive naira amount and real due date.' };
    try {
    const actor = await getActor(), value = parsed.data;
    const { context, tenantId, data } = checked(actor, value.expectedCompanyId);
    const digest = hash({ ...value, idempotencyKey: undefined }); const prior = replay(data, actor, value.idempotencyKey, 'invoice', digest);
    if (prior) return { ok: true, id: prior.resultId, message: 'This invoice draft was already saved.' };
    const bound = recipient(actor, value.residentId, value.expectedUnitId, context.state), clock = operatingClock();
    if (!Number.isSafeInteger(existingNgnInvoiceTotal(context.state, tenantId) + nairaToKobo(value.amount)!)) throw new Error('Invoice totals require accounting review before adding charges.');
    const invoice = { tenantId, id: `invoice-${randomUUID()}`, ref: nextEstateInvoiceReference(context.state, tenantId, clock.dateISO.slice(0, 4)),
      unitId: bound.unit.id, estateId: bound.site.id, residentName: bound.resident.name, ownerUserId: bound.resident.userId, description: value.description,
      status: 'draft', amount: { minor: nairaToKobo(value.amount)!, currency: 'NGN' }, paid: { minor: 0, currency: 'NGN' }, dueDate: value.dueDate,
      agingDays: Math.floor((Date.parse(`${clock.dateISO}T00:00:00Z`) - Date.parse(`${value.dueDate}T00:00:00Z`)) / 86400000),
    } as Invoice;
    (context.state.collections.invoices as Invoice[]).push(invoice);
    appendInvoiceCreation(context.state, invoice, attributed(actor), clock.iso, 'One-off charge draft; manager review required.');
    data.receipts.push({ key: value.idempotencyKey, actorId: actor.userId, kind: 'invoice', hash: digest, resultId: invoice.id });
    data.audit.push({ tenantId, actorId: actor.userId, action: 'invoice.created', entityId: invoice.id, at: clock.iso });
    refresh(); return { ok: true, id: invoice.id, message: `${invoice.ref} saved as a draft. Review and issue it when ready.` };
    } catch (error) { return billingFailure(error); }
  }, 'estate');
}
export async function createEstateRecurringCharge(input: unknown): Promise<EstateBillingResult> {
  return withDurableMutation(async () => {
  const parsed = recurringInput.safeParse(input); if (!parsed.success) return { ok: false, error: 'Enter valid recurring charge details, dates and a positive naira amount.' };
    try {
    const actor = await getActor(), value = parsed.data;
    const { context, tenantId, data } = checked(actor, value.expectedCompanyId);
    const digest = hash({ ...value, idempotencyKey: undefined }), prior = replay(data, actor, value.idempotencyKey, 'recurring', digest);
    if (prior) return { ok: true, id: prior.resultId, message: 'This recurring charge was already saved.' };
    if (data.rules.length >= 2000) return { ok: false, error: 'This company has reached its 2,000 recurring-charge limit.' };
    const bound = recipient(actor, value.residentId, value.expectedUnitId, context.state), clock = operatingClock();
    const rule: EstateRecurringRule = { id: randomUUID(), tenantId, estateId: String(bound.site.id), residentId: value.residentId, unitId: String(bound.unit.id), ownerUserId: String(bound.resident.userId),
      description: value.description, amountMinor: nairaToKobo(value.amount)!, currency: 'NGN', frequency: value.frequency, startDate: value.startDate, endDate: value.endDate,
      dueOffsetDays: value.dueOffsetDays, enabled: true, nextCycleIndex: 0, version: 1, createdBy: actor.userId, createdAt: clock.iso, updatedAt: clock.iso };
    data.rules.push(rule); data.receipts.push({ key: value.idempotencyKey, actorId: actor.userId, kind: 'recurring', hash: digest, resultId: rule.id });
    data.audit.push({ tenantId, actorId: actor.userId, action: 'recurring.created', entityId: rule.id, at: clock.iso });
    refresh(); return { ok: true, id: rule.id, message: 'Recurring charge saved. Due cycles generate drafts for manager review.' };
    } catch (error) { return billingFailure(error); }
  }, 'estate');
}
export async function updateEstateRecurringCharge(input: unknown): Promise<EstateBillingResult> {
  return withDurableMutation(async () => {
  const parsed = updateInput.safeParse(input); if (!parsed.success) return { ok: false, error: 'Enter valid future charge details.' };
    try {
    const actor = await getActor(), value = parsed.data;
    const { scope, tenantId, data } = checked(actor, value.expectedCompanyId, 'update');
    const rule = data.rules.find((row) => row.id === value.ruleId && matchesScope(row, scope));
    if (!rule || rule.version !== value.expectedVersion) throw new Error('This recurring charge changed or is unavailable. Refresh Billing.');
    const clock = operatingClock(), next = nextRuleDate(rule);
    if (!next || next <= clock.dateISO) throw new Error('Catch up due cycles before changing future charge terms. Existing invoice drafts stay unchanged.');
    if (value.endDate && value.endDate < rule.startDate) throw new Error('The end date must be on or after the first cycle.');
    const before = { amountMinor: rule.amountMinor, endDate: rule.endDate, dueOffsetDays: rule.dueOffsetDays };
    rule.description = value.description; rule.amountMinor = nairaToKobo(value.amount)!; rule.endDate = value.endDate; rule.dueOffsetDays = value.dueOffsetDays;
    rule.version++; rule.updatedAt = clock.iso; data.audit.push({ tenantId, actorId: actor.userId, action: 'recurring.updated', entityId: rule.id, at: clock.iso, note: JSON.stringify({ before, after: { amountMinor: rule.amountMinor, endDate: rule.endDate, dueOffsetDays: rule.dueOffsetDays } }) });
    refresh(); return { ok: true, message: 'Future charge terms updated. Existing invoices are unchanged.' };
    } catch (error) { return billingFailure(error); }
  }, 'estate');
}
export async function setEstateRecurringChargeEnabled(input: unknown): Promise<EstateBillingResult> {
  return withDurableMutation(async () => {
  const parsed = z.strictObject({ expectedCompanyId: binding.expectedCompanyId, ruleId: z.uuid(), expectedVersion: z.number().int().positive(), enabled: z.boolean() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Choose a valid recurring charge.' };
    try {
    const actor = await getActor(), value = parsed.data; const { data, scope, tenantId } = checked(actor, value.expectedCompanyId, 'update');
    const rule = data.rules.find((row) => row.id === value.ruleId && matchesScope(row, scope));
    if (!rule || rule.version !== value.expectedVersion) throw new Error('This recurring charge changed or is unavailable. Refresh Billing.');
    const clock = operatingClock();
    if (value.enabled && !rule.enabled) while (recurringCycleDate(rule, rule.nextCycleIndex) < clock.dateISO && nextRuleDate(rule)) rule.nextCycleIndex++;
    rule.enabled = value.enabled; rule.version++; rule.updatedAt = clock.iso;
    data.audit.push({ tenantId, actorId: actor.userId, action: value.enabled ? 'recurring.resumed' : 'recurring.paused', entityId: rule.id, at: clock.iso });
    refresh(); return { ok: true, message: value.enabled ? 'Recurring charge resumed. Paused past periods will not be back-billed.' : 'Recurring charge paused. Existing invoices are unchanged.' };
    } catch (error) { return billingFailure(error); }
  }, 'estate');
}
export async function generateDueEstateCharges(input: unknown): Promise<EstateBillingResult> {
  return withDurableMutation(async () => {
  const parsed = z.strictObject({ expectedCompanyId: binding.expectedCompanyId }).safeParse(input); if (!parsed.success) return { ok: false, error: 'Choose the current company.' };
    try {
    const actor = await getActor(), { context, scope, tenantId } = checked(actor, parsed.data.expectedCompanyId);
    const result = processDueEstateCharges(context.state, tenantId, operatingClock().dateISO, { ...attributed(actor), estateIds: scope.estateIds === 'all' ? undefined : scope.estateIds });
    refresh(); return { ok: true, ...result, message: `${result.created} invoice draft${result.created === 1 ? '' : 's'} generated.${result.remainingDue ? ' More cycles are due; run catch-up again.' : ''}${result.skipped ? ' Some charge rules need resident or unit review.' : ''}` };
    } catch (error) { return billingFailure(error); }
  }, 'estate');
}

export async function issueEstateInvoice(input: unknown): Promise<EstateBillingResult> {
  return withDurableMutation(async () => {
  const parsed = z.strictObject({ expectedCompanyId: binding.expectedCompanyId, invoiceId: z.string().min(1).max(200) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Choose an available invoice draft.' };
    try {
    const actor = await getActor(), { context, scope } = checked(actor, parsed.data.expectedCompanyId, 'transition');
    const invoice = (context.state.collections.invoices as Invoice[]).find((row) => row.id === parsed.data.invoiceId && matchesScope(row, scope));
    if (!invoice || invoice.status !== 'draft') return { ok: false, error: 'This invoice is no longer an available draft. Refresh Billing.' };
    const result = await issueInvoice(invoice.ref, parsed.data.expectedCompanyId);
    if (!result.ok) return result;
    refresh(); return { ok: true, message: `${invoice.ref} issued in the ledger. External payment and delivery services are separate.` };
    } catch (error) { return billingFailure(error); }
  }, 'estate');
}

export async function updateEstateInvoiceDraft(input: unknown): Promise<EstateBillingResult> {
  return withDurableMutation(async () => {
    const parsed = z.strictObject({ ...binding, invoiceId: z.string().min(1).max(200), expectedSnapshot: z.string().min(1).max(600), description: billingText, amount, dueDate: billingDate }).safeParse(input);
    if (!parsed.success) return { ok: false, error: 'Enter valid invoice draft details.' };
    try {
      const actor = await getActor(), value = parsed.data;
      const { context, scope, data, tenantId } = checked(actor, value.expectedCompanyId, 'update');
      const invoice = (context.state.collections.invoices as Invoice[]).find((row) => row.id === value.invoiceId && matchesScope(row, scope));
      if (!invoice || invoice.status !== 'draft' || invoice.paid.minor !== 0 || invoice.amount.currency !== 'NGN') return { ok: false, error: 'Only an unpaid NGN draft can be edited. Issued invoices retain their approved values.' };
      const digest = hash(value), prior = replay(data, actor, value.idempotencyKey, 'invoice.update', digest);
      if (prior) return { ok: true, id: invoice.id, message: 'This draft change was already saved.' };
      if (JSON.stringify([invoice.description, invoice.amount.minor, invoice.dueDate]) !== value.expectedSnapshot) return { ok: false, error: 'This invoice draft changed in another tab. Refresh Billing before editing it.' };
      const bound = billableResident(context.state, tenantId, (context.state.collections.residents as Resident[]).find((resident) => resident.tenantId === tenantId && resident.userId === invoice.ownerUserId && resident.unitId === invoice.unitId && ['active', 'invited'].includes(resident.status))?.id ?? '');
      if (!bound || String(bound.site.id) !== String(invoice.estateId)) return { ok: false, error: 'Review the resident and unit binding before editing this draft.' };
      const minor = nairaToKobo(value.amount)!;
      if (!Number.isSafeInteger(existingNgnInvoiceTotal(context.state, tenantId) - invoice.amount.minor + minor)) throw new Error('Invoice totals require accounting review before adding charges.');
      const before = { amountMinor: invoice.amount.minor, dueDate: invoice.dueDate };
      invoice.description = value.description; invoice.amount = { minor, currency: 'NGN' }; invoice.dueDate = value.dueDate;
      const clock = operatingClock(); invoice.agingDays = Math.floor((Date.parse(`${clock.dateISO}T00:00:00Z`) - Date.parse(`${value.dueDate}T00:00:00Z`)) / 86400000);
      data.receipts.push({ key: value.idempotencyKey, actorId: actor.userId, kind: 'invoice.update', hash: digest, resultId: invoice.id });
      data.audit.push({ tenantId, actorId: actor.userId, action: 'invoice.draft_updated', entityId: invoice.id, at: clock.iso, note: JSON.stringify({ before, after: { amountMinor: minor, dueDate: value.dueDate } }) });
      refresh(); return { ok: true, id: invoice.id, message: 'Draft updated. Review and issue the final values when ready.' };
    } catch (error) { return billingFailure(error); }
  }, 'estate');
}
