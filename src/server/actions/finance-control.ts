'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { canEnterWorkspace } from '@/config/workspaces';
import { payableDeductions, type FinanceModule } from '@/domain/finance/control';
import { assertCan, ForbiddenError, type Action } from '@/lib/authz';
import { canUseCompanyModule } from '@/lib/auth/company-policy';
import { durableAudit } from '@/server/audit';
import { constructionControl } from '@/server/construction-control';
import { withDurableMutation } from '@/server/data/durable-records';
import { nextRecordSequence } from '@/server/data/record-context';
import { repos } from '@/server/data';
import { financeControl } from '@/server/finance-control';
import { approveSettlement } from '@/server/payments';
import { getActor } from '@/server/session';
import { nowISO } from '@/server/clock';

type Result = { ok: true; id?: string; message: string } | { ok: false; error: string };
const refresh = () => ['/finance', '/billing', '/collections', '/shortlet/operations', '/construction/operations'].forEach((path) => revalidatePath(path));
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => Number.isFinite(Date.parse(value)));
const identifier = z.string().min(1).max(200).regex(/^[A-Za-z0-9_:-]+$/);
const moduleAllowed = (actor: Awaited<ReturnType<typeof getActor>>, module: FinanceModule, action: Action) => canUseCompanyModule(actor, module, action);

async function gate(action: Action) {
  const actor = await getActor();
  if (!actor.tenantId || !canEnterWorkspace(actor, 'estate')) return { ok: false as const, error: 'You cannot access company finance.' };
  try { assertCan(actor, 'charges_invoicing', action); return { actor }; }
  catch (error) { if (error instanceof ForbiddenError) return { ok: false as const, error: 'Your current role cannot perform this finance action.' }; throw error; }
}

async function audit(tenantId: string, actorId: string, action: string, entity: string, entityId: string, payload: Record<string, unknown>) {
  await durableAudit({ tenantId, actorSubject: actorId, action, entity, entityId, payload });
}

const payableSchema = z.object({
  module: z.enum(['estate', 'facility', 'shortlet', 'construction']), counterparty: z.string().trim().min(2).max(160),
  description: z.string().trim().min(3).max(500), sourceRef: z.string().trim().min(2).max(120),
  invoiceDateISO: isoDate, dueDateISO: isoDate, grossNaira: z.number().finite().positive().max(100_000_000_000), whtPct: z.number().min(0).max(20),
}).strict();

export async function createFinancePayable(input: z.input<typeof payableSchema>): Promise<Result> {
  return withDurableMutation(async () => {
    const access = await gate('create'); if (!access.actor) return { ok: false, error: access.error };
    const parsed = payableSchema.safeParse(input); if (!parsed.success || parsed.data.dueDateISO < parsed.data.invoiceDateISO) return { ok: false, error: 'Enter a valid supplier invoice, source reference, dates, NGN value and WHT rate.' };
    if (!moduleAllowed(access.actor, parsed.data.module, 'create')) return { ok: false, error: 'Your current role cannot create a payable for that workspace.' };
    const state = financeControl(access.actor.tenantId!);
    if (state.payables.some((row) => row.module === parsed.data.module && row.sourceRef.toLowerCase() === parsed.data.sourceRef.toLowerCase() && row.status !== 'rejected')) return { ok: false, error: 'This module and source reference already have an active payable.' };
    const grossMinor = Math.round(parsed.data.grossNaira * 100); if (!Number.isSafeInteger(grossMinor)) return { ok: false, error: 'The invoice amount is outside the supported range.' };
    const deductions = payableDeductions(grossMinor, parsed.data.whtPct); const sequence = nextRecordSequence('finance:payableSeq', 0, true); const ref = `AP-${String(sequence).padStart(6, '0')}`;
    const row = { tenantId: access.actor.tenantId!, id: `fp-${randomUUID()}`, ref, ...parsed.data, grossMinor, ...deductions, status: 'pending_approval' as const, requestedBy: access.actor.userId, requestedAtISO: nowISO() };
    state.payables.unshift(row);
    await audit(access.actor.tenantId!, access.actor.userId, 'finance.payable.created', 'finance_payable', row.id, { ref, module: row.module, sourceRef: row.sourceRef, grossMinor, whtMinor: row.whtMinor });
    refresh(); return { ok: true, id: row.id, message: `${ref} submitted for finance approval.` };
  }, ['estate', 'facility', 'shortlet', 'construction']);
}

export async function decideFinancePayable(id: string, decision: 'approved' | 'rejected', note = ''): Promise<Result> {
  return withDurableMutation(async () => {
    const access = await gate('approve'); if (!access.actor) return { ok: false, error: access.error };
    const row = financeControl(access.actor.tenantId!).payables.find((item) => item.id === id && item.status === 'pending_approval');
    if (!row) return { ok: false, error: 'Pending payable not found.' };
    if (!moduleAllowed(access.actor, row.module, 'approve')) return { ok: false, error: 'Your current role cannot approve this workspace payable.' };
    row.status = decision; row.reviewedBy = access.actor.userId; row.reviewedAtISO = nowISO(); row.reviewNote = note.trim().slice(0, 500) || undefined;
    await audit(access.actor.tenantId!, access.actor.userId, `finance.payable.${decision}`, 'finance_payable', row.id, { ref: row.ref, module: row.module, netPayableMinor: row.netPayableMinor });
    refresh(); return { ok: true, id: row.id, message: `${row.ref} ${decision}. No bank transfer has been executed.` };
  }, ['estate', 'facility', 'shortlet', 'construction']);
}

export async function markFinancePayablePaid(id: string, bankReference: string): Promise<Result> {
  return withDurableMutation(async () => {
    const access = await gate('update'); if (!access.actor) return { ok: false, error: access.error };
    const reference = bankReference.trim(); const row = financeControl(access.actor.tenantId!).payables.find((item) => item.id === id && item.status === 'approved');
    if (!row || reference.length < 3 || reference.length > 160) return { ok: false, error: 'An approved payable and actual bank reference are required.' };
    if (!moduleAllowed(access.actor, row.module, 'update')) return { ok: false, error: 'Your current role cannot update this workspace payable.' };
    row.status = 'paid'; row.bankReference = reference; row.paidAtISO = nowISO();
    await audit(access.actor.tenantId!, access.actor.userId, 'finance.payable.paid', 'finance_payable', row.id, { ref: row.ref, module: row.module, bankReference: reference, netPayableMinor: row.netPayableMinor });
    refresh(); return { ok: true, id: row.id, message: `${row.ref} marked paid from the recorded bank reference.` };
  }, ['estate', 'facility', 'shortlet', 'construction']);
}

export async function issueWhtCertificate(sourceType: 'finance_payable' | 'construction_payment' | 'construction_claim', sourceId: string, periodISO: string, evidence?: { externalCertificateRef: string; remittanceRef: string }): Promise<Result> {
  return withDurableMutation(async () => {
    const access = sourceType === 'construction_claim' ? await constructionCertificateGate() : await gate('approve'); if (!access.actor) return { ok: false, error: access.error };
    if (!identifier.safeParse(sourceId).success || !isoDate.safeParse(periodISO).success) return { ok: false, error: 'Choose an eligible paid item and certificate period.' };
    const state = financeControl(access.actor.tenantId!);
    if (state.whtCertificates.some((row) => row.sourceId === sourceId)) return { ok: false, error: 'A WHT certificate has already been issued for this source.' };
    let source: { module: FinanceModule; sourceRef: string; beneficiary: string; grossMinor: number; ratePct: number; amountMinor: number } | undefined;
    if (sourceType === 'finance_payable') {
      const row = state.payables.find((item) => item.id === sourceId && item.status === 'paid' && item.whtMinor > 0);
      if (row && moduleAllowed(access.actor, row.module, 'approve')) source = { module: row.module, sourceRef: row.ref, beneficiary: row.counterparty, grossMinor: row.grossMinor, ratePct: row.whtPct, amountMinor: row.whtMinor };
    } else if (sourceType === 'construction_payment') {
      if (!moduleAllowed(access.actor, 'construction', 'approve')) return { ok: false, error: 'Your current role cannot issue Construction certificates.' };
      const row = constructionControl(access.actor.tenantId!).payments.find((item) => item.id === sourceId && item.status === 'paid' && item.whtMinor > 0);
      if (row) { const order = repos.constructionOrders.list(access.actor, { limit: 5000 }).items.find((item) => item.id === row.poId); source = { module: 'construction', sourceRef: row.ref, beneficiary: order?.vendorName ?? row.invoiceRef, grossMinor: row.invoiceMinor, ratePct: row.invoiceMinor ? row.whtMinor / row.invoiceMinor * 100 : 0, amountMinor: row.whtMinor }; }
    } else if (sourceType === 'construction_claim') {
      if (!moduleAllowed(access.actor, 'construction', 'approve')) return { ok: false, error: 'Your current role cannot record Construction claim certificates.' };
      const claim = constructionControl(access.actor.tenantId!).claims.find((row) => row.id === sourceId && row.status === 'paid' && row.whtMinor > 0);
      if (claim && repos.constructionProjects.list(access.actor, { limit: 5000 }).items.some((row) => row.id === claim.projectId)) {
        const subcontractor = repos.constructionSubcontractors.list(access.actor, { limit: 5000 }).items.find((row) => row.id === claim.subcontractorId)
          ?? constructionControl(access.actor.tenantId!).subcontractors.find((row) => row.id === claim.subcontractorId);
        source = { module: 'construction', sourceRef: claim.ref, beneficiary: subcontractor?.name ?? claim.subcontractorId, grossMinor: (claim.assessedMinor ?? claim.claimedMinor) - claim.retentionMinor, ratePct: claim.whtPct, amountMinor: claim.whtMinor };
      }
    }
    if (!source) return { ok: false, error: 'Only paid items with recorded WHT can receive a certificate.' };
    if (sourceType === 'construction_claim' && (!evidence || !/^[A-Za-z0-9 /._:-]{5,120}$/.test(evidence.externalCertificateRef.trim()) || !/^[A-Za-z0-9 /._:-]{5,120}$/.test(evidence.remittanceRef.trim()))) return { ok: false, error: 'Enter the tax authority certificate and remittance references for this paid claim.' };
    if (evidence?.externalCertificateRef && state.whtCertificates.some((row) => row.externalCertificateRef === evidence.externalCertificateRef.trim())) return { ok: false, error: 'This external certificate reference is already recorded.' };
    const sequence = nextRecordSequence('finance:whtSeq', 0, true); const ref = `WHT-${periodISO.slice(0, 4)}-${String(sequence).padStart(5, '0')}`;
    const certificate = { tenantId: access.actor.tenantId!, id: `wht-${randomUUID()}`, ref, ...source, sourceId, periodISO, status: 'issued' as const, issuedBy: access.actor.userId, issuedAtISO: nowISO(), externalCertificateRef: evidence?.externalCertificateRef.trim(), remittanceRef: evidence?.remittanceRef.trim() };
    state.whtCertificates.unshift(certificate);
    await audit(access.actor.tenantId!, access.actor.userId, 'finance.wht_certificate.issued', 'wht_certificate', certificate.id, { ref, sourceRef: source.sourceRef, module: source.module, amountMinor: source.amountMinor });
    refresh(); return { ok: true, id: certificate.id, message: `${ref} issued and added to the company register.` };
  }, ['estate', 'facility', 'shortlet', 'construction']);
}

async function constructionCertificateGate() {
  const actor = await getActor();
  if (!actor.tenantId || !canEnterWorkspace(actor, 'construction') || actor.companyAccess && !['owner', 'admin'].includes(actor.companyAccess.companyRole) && actor.companyAccess.operationalProfileId !== 'construction-finance') return { ok: false as const, error: 'Only Construction finance can record claim WHT certificates.' };
  try { assertCan(actor, 'reports_analytics', 'transition'); return { actor }; }
  catch (error) { if (error instanceof ForbiddenError) return { ok: false as const, error: 'Your role cannot record claim WHT certificates.' }; throw error; }
}

export async function decideBankSettlement(settlementId: string, approve: boolean): Promise<Result> {
  return withDurableMutation(async () => {
    const access = await gate('approve'); if (!access.actor) return { ok: false, error: access.error };
    if (!/^[0-9a-f-]{36}$/i.test(settlementId)) return { ok: false, error: 'Settlement record not found.' };
    await approveSettlement(access.actor.tenantId!, settlementId, access.actor.userId, approve);
    await audit(access.actor.tenantId!, access.actor.userId, approve ? 'finance.settlement.approved' : 'finance.settlement.rejected', 'settlement_line', settlementId, {});
    refresh(); return { ok: true, id: settlementId, message: approve ? 'Settlement approved.' : 'Settlement rejected.' };
  }, ['estate', 'facility', 'shortlet', 'construction']);
}
