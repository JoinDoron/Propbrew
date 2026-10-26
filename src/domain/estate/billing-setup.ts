import { z } from 'zod';
import type { Invoice, Resident, Site, Unit } from '@/domain/entities';
import type { WorkspaceRecordState } from '@/server/data/record-context';

const DAY = 86_400_000;
export const MAX_RECURRING_CATCHUP = 24;
export const BILLING_SIDECAR = 'estateBilling';
export const billingDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => value >= '1900-01-01' && value <= '2100-12-31' && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value, 'Choose a real date between 1900 and 2100.');
export const billingText = z.string().trim().min(2).max(240).refine((value) => !/[\u0000-\u001f\u007f]/.test(value));
export const frequencySchema = z.enum(['monthly', 'quarterly', 'yearly']);
/** Parse decimal naira without floating-point multiplication or silent rounding. */
export function nairaToKobo(value: string): number | null {
  if (typeof value !== 'string' || !/^(?:0|[1-9]\d{0,12})(?:\.\d{1,2})?$/.test(value.trim())) return null;
  const [whole, fraction = ''] = value.trim().split('.');
  const minor = BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, '0'));
  return minor > BigInt(0) && minor <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(minor) : null;
}
export function koboInput(minor: number): string { return `${Math.trunc(minor / 100)}.${String(minor % 100).padStart(2, '0')}`; }
export const recurringRuleSchema = z.strictObject({
  id: z.uuid(), tenantId: z.string().min(1), estateId: z.string().min(1), residentId: z.string().min(1), unitId: z.string().min(1), ownerUserId: z.string().min(1),
  description: billingText, amountMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), currency: z.literal('NGN'),
  frequency: frequencySchema, startDate: billingDate, endDate: billingDate.nullable(), dueOffsetDays: z.number().int().min(0).max(90),
  enabled: z.boolean(), nextCycleIndex: z.number().int().min(0).max(2500), version: z.number().int().positive(),
  createdBy: z.string().min(1), createdAt: z.string(), updatedAt: z.string(),
});
export type EstateRecurringRule = z.infer<typeof recurringRuleSchema>;
export type BillingActor = { id: string; name: string; role: string; at?: string; estateIds?: readonly string[] };
export type BillingAudit = { tenantId: string; actorId: string; action: string; entityId: string; at: string; note?: string };
export type EstateBillingState = { tenantId: string; rules: EstateRecurringRule[]; receipts: { key: string; actorId: string; hash: string; kind: string; resultId: string }[]; audit: BillingAudit[] };
const sidecarSchema = z.strictObject({ tenantId: z.string().min(1), rules: z.array(recurringRuleSchema).max(2000),
  receipts: z.array(z.strictObject({ key: z.string(), actorId: z.string(), hash: z.string(), kind: z.string(), resultId: z.string() })),
  audit: z.array(z.strictObject({ tenantId: z.string(), actorId: z.string(), action: z.string(), entityId: z.string(), at: z.string(), note: z.string().optional() })),
});
export function estateBillingState(state: WorkspaceRecordState, tenantId: string, create = false): EstateBillingState {
  const existing = state.auxiliary[BILLING_SIDECAR];
  if (existing === undefined) {
    const blank: EstateBillingState = { tenantId, rules: [], receipts: [], audit: [] };
    if (create) state.auxiliary[BILLING_SIDECAR] = blank;
    return blank;
  }
  const parsed = sidecarSchema.parse(existing);
  if (parsed.tenantId !== tenantId || parsed.rules.some((row) => row.tenantId !== tenantId) || parsed.audit.some((row) => row.tenantId !== tenantId)) throw new Error('Billing setup belongs to another company.');
  return existing as EstateBillingState;
}
/** Each cycle is calculated from its original calendar anchor. Jan31→Feb28→Mar31. */
export function recurringCycleDate(rule: Pick<EstateRecurringRule, 'startDate' | 'frequency'>, index: number): string {
  if (!billingDate.safeParse(rule.startDate).success || !Number.isInteger(index) || index < 0 || index > 2500) throw new Error('Invalid charge cycle.');
  const [year, month, day] = rule.startDate.split('-').map(Number);
  const absoluteMonth = year * 12 + month - 1 + index * ({ monthly: 1, quarterly: 3, yearly: 12 }[rule.frequency]);
  const targetYear = Math.floor(absoluteMonth / 12), targetMonth = absoluteMonth % 12;
  const finalDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return `${String(targetYear).padStart(4, '0')}-${String(targetMonth + 1).padStart(2, '0')}-${String(Math.min(day, finalDay)).padStart(2, '0')}`;
}
export function addBillingDays(date: string, days: number): string { return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10); }
export function nextRuleDate(rule: EstateRecurringRule): string | null {
  const date = recurringCycleDate(rule, rule.nextCycleIndex);
  return date > '2100-12-31' || rule.endDate && date > rule.endDate ? null : date;
}
export function nextEstateInvoiceReference(state: WorkspaceRecordState, tenantId: string, year: string): string {
  const invoices = state.collections.invoices as Invoice[];
  const prefix = `INV-${year}-`, key = `estate:invoice:${year}`;
  const highest = invoices.filter((row) => row.tenantId === tenantId && row.ref.startsWith(prefix)).reduce((max, row) => {
    const suffix = row.ref.slice(prefix.length); return /^\d+$/.test(suffix) ? Math.max(max, Number(suffix)) : max;
  }, state.sequences[key] ?? 0);
  if (!Number.isSafeInteger(highest) || highest >= Number.MAX_SAFE_INTEGER - 1) throw new Error('Invoice references need administrator review.');
  state.sequences[key] = highest + 1;
  return `${prefix}${String(highest + 1).padStart(5, '0')}`;
}
export function billableResident(state: WorkspaceRecordState, tenantId: string, residentId: string) {
  const resident = (state.collections.residents as Resident[]).find((row) => row.tenantId === tenantId && row.id === residentId && ['active', 'invited'].includes(row.status));
  const unit = resident && (state.collections.units as Unit[]).find((row) => row.tenantId === tenantId && row.id === resident.unitId && row.siteId === resident.siteId && ['occupied', 'reserved'].includes(row.occupancy));
  const site = unit && (state.collections.sites as Site[]).find((row) => row.tenantId === tenantId && row.id === unit.siteId && row.kind === 'estate');
  return resident && unit && site ? { resident, unit, site } : null;
}
/** Keep subsequent UI/accounting sums within exact integer precision. */
export function existingNgnInvoiceTotal(state: WorkspaceRecordState, tenantId: string): number {
  let total = BigInt(0);
  for (const row of state.collections.invoices as Invoice[]) {
    if (row.tenantId !== tenantId || row.amount.currency !== 'NGN') continue;
    if (!Number.isSafeInteger(row.amount.minor) || row.amount.minor < 0) throw new Error('Invoice totals require accounting review before adding charges.');
    total += BigInt(row.amount.minor);
  }
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Invoice totals require accounting review before adding charges.');
  return Number(total);
}
export function appendInvoiceCreation(state: WorkspaceRecordState, invoice: Invoice, actor: BillingActor, at: string, note: string) {
  const key = `${invoice.tenantId}:service-charge:${invoice.id}`;
  if (state.history[key]?.length) throw new Error('Invoice creation history already exists.');
  state.history[key] = [{ seq: 0, at, event: 'CREATE', from: null, to: 'draft', actorId: actor.id, actorName: actor.name, actorRole: actor.role, note }];
}
/** Trusted scheduler and scoped manual generation share this same deterministic projection.
 * Invoices remain drafts; this never issues charges, applies penalties or sends messages. */
export function processDueEstateCharges(state: WorkspaceRecordState, tenantId: string, todayISO: string, actor: BillingActor): { created: number; remainingDue: number; skipped: number } {
  billingDate.parse(todayISO);
  if (!tenantId || !actor.id || !actor.name || !actor.role) throw new Error('A trusted billing actor is required.');
  const at = actor.at ?? `${todayISO}T00:00:00Z`;
  if (!Number.isFinite(Date.parse(at))) throw new Error('A valid billing audit timestamp is required.');
  const data = estateBillingState(state, tenantId);
  let created = 0, remainingDue = 0, skipped = 0;
  const invoices = state.collections.invoices as Invoice[];
  let invoiceTotal = existingNgnInvoiceTotal(state, tenantId);
  const rules = data.rules.filter((row) => row.enabled && (actor.estateIds === undefined || actor.estateIds.includes(row.estateId)));
  for (const rule of rules) {
    const resident = billableResident(state, tenantId, rule.residentId);
    if (!resident || resident.unit.id !== rule.unitId || resident.site.id !== rule.estateId || resident.resident.userId !== rule.ownerUserId) { skipped++; continue; }
    let cycle = nextRuleDate(rule);
    while (cycle && cycle <= todayISO && created < MAX_RECURRING_CATCHUP) {
      const id = `inv-rec-${rule.id}-${cycle}`;
      const existing = invoices.find((row) => row.tenantId === tenantId && row.id === id);
      if (!existing) {
        if (!Number.isSafeInteger(invoiceTotal + rule.amountMinor)) throw new Error('Invoice totals require accounting review before adding charges.');
        const dueDate = addBillingDays(cycle, rule.dueOffsetDays);
        if (dueDate > '2100-12-31') { skipped++; break; }
        const invoice = { tenantId, id, ref: nextEstateInvoiceReference(state, tenantId, cycle.slice(0, 4)), unitId: rule.unitId, estateId: rule.estateId,
          residentName: resident.resident.name, ownerUserId: rule.ownerUserId, description: `${rule.description} · ${cycle}`, status: 'draft',
          amount: { minor: rule.amountMinor, currency: 'NGN' }, paid: { minor: 0, currency: 'NGN' }, dueDate, agingDays: Math.floor((Date.parse(`${todayISO}T00:00:00Z`) - Date.parse(`${dueDate}T00:00:00Z`)) / DAY),
        } as Invoice;
        invoices.push(invoice); invoiceTotal += rule.amountMinor;
        appendInvoiceCreation(state, invoice, actor, at, `Recurring charge ${rule.id}; period ${cycle}; manager review required.`);
        data.audit.push({ tenantId, actorId: actor.id, action: 'recurring.draft_generated', entityId: id, at, note: `Rule ${rule.id}; period ${cycle}` });
        created++;
      }
      rule.nextCycleIndex++; rule.updatedAt = at; cycle = nextRuleDate(rule);
    }
    if (cycle && cycle <= todayISO) remainingDue++;
  }
  return { created, remainingDue, skipped };
}
