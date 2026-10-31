'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { canEnterWorkspace } from '@/config/workspaces';
import { forecastFinishISO, projectEVMOf } from '@/domain/construction';
import type { Project, Variation } from '@/domain/construction/types';
import { money } from '@/domain/primitives';
import { assertCan, ForbiddenError, type Actor } from '@/lib/authz';
import { constructionControl } from '@/server/construction-control';
import { scopedConstructionProjectGet } from '@/server/data';
import { withDurableMutation } from '@/server/data/durable-records';
import { nextRecordSequence } from '@/server/data/record-context';
import { db } from '@/server/data/store';
import { operatingDateISO, operatingNowISO } from '@/server/operating-clock';
import { rfiInScope, rfiPackageAllowed } from '@/server/construction/rfi-access';
import { getActor } from '@/server/session';

type Result = { ok: true; ref: string } | { ok: false; error: string };
const id = z.string().trim().min(1).max(200);
const note = z.string().trim().min(8).max(1000);
const naira = z.number().finite().positive().max(100_000_000_000);
const proposalSchema = z.object({ projectId: id, sourceKind: z.enum(['rfi', 'site_issue']), sourceId: id,
  title: z.string().trim().min(4).max(180), reason: note, costCode: id, subcontractorId: id }).strict();
const quoteSchema = z.object({ amountNaira: naira, reference: z.string().trim().min(3).max(160), scope: note }).strict();
const assessmentSchema = z.object({ budgetDeltaNaira: naira, scheduleDays: z.number().int().min(0).max(365), note }).strict();
const decisionSchema = z.object({ decision: z.enum(['approved', 'rejected']), reference: z.string().trim().min(3).max(160), note }).strict();
const postingSchema = z.object({ reference: z.string().trim().min(3).max(160) }).strict();
const refresh = () => ['/construction', '/construction/changes', '/construction/operations', '/construction/projects', '/construction/schedule', '/construction/simulator', '/construction/build-watch', '/construction/evm', '/construction/boq', '/construction/copilot', '/construction/audit'].forEach((path) => revalidatePath(path));

async function gate(action: 'create' | 'update' | 'approve'): Promise<{ actor: Actor } | { error: string }> {
  const actor = await getActor();
  if (!canEnterWorkspace(actor, 'construction')) return { error: 'Your account cannot access Construction.' };
  try { assertCan(actor, 'reports_analytics', action); return { actor }; }
  catch (error) { if (error instanceof ForbiddenError) return { error: 'Your Construction role cannot perform this change-order step.' }; throw error; }
}
function profile(actor: Actor, allowed: readonly string[]): boolean {
  const access = actor.companyAccess;
  return !access || access.companyRole === 'owner' || access.companyRole === 'admin'
    || !access.operationalProfileId || allowed.includes(access.operationalProfileId);
}
function amount(value: number): number | null {
  const minor = Math.round(value * 100);
  return Number.isSafeInteger(minor) && minor > 0 ? minor : null;
}
function audit(actor: Actor, order: Variation, action: 'issue' | 'record' | 'approve' | 'reject' | 'post_cost', summary: string, amountMinor?: number) {
  const seq = nextRecordSequence('construction:auditSeq', db.constructionAudit.reduce((max, row) => Math.max(max, row.seq), 0), true);
  db.constructionAudit.unshift({ tenantId: actor.tenantId!, id: `ca-${randomUUID()}`, seq, atISO: operatingNowISO(), actorId: actor.userId,
    actorName: db.users.find((row) => row.id === actor.userId && row.tenantId === actor.tenantId)?.name ?? 'Construction operator',
    actorRole: String(actor.roles[0] ?? 'operator'), action, entity: 'construction_change_order', entityRef: order.ref,
    projectId: order.projectId, summary, amountMinor } as (typeof db.constructionAudit)[number]);
}
function projectFor(actor: Actor, projectId: string, action: 'read' | 'create' | 'update' = 'read'): Project | null {
  try { return scopedConstructionProjectGet(actor, projectId, action); } catch { return null; }
}
function orderFor(actor: Actor, orderId: string): Variation | null {
  const order = db.constructionVariations.find((row) => row.id === orderId && row.tenantId === actor.tenantId && row.changeOrder);
  const project = order && projectFor(actor, order.projectId);
  return order && project && rfiPackageAllowed(actor, project, order.changeOrder?.workPackageId)
    && (!actor.constructionSubcontractorIds || actor.constructionSubcontractorIds.includes(order.changeOrder!.subcontractorId)) ? order : null;
}
function contractorFor(actor: Actor, projectId: string, contractorId: string): { id: string; name: string } | null {
  const control = constructionControl(actor.tenantId!);
  const fresh = control.subcontractors.find((row) => row.id === contractorId && row.tenantId === actor.tenantId && row.projectIds.includes(projectId) && row.status === 'approved');
  if (fresh) return { id: fresh.id, name: fresh.name };
  const existing = db.constructionSubcontractors.find((row) => row.id === contractorId && row.tenantId === actor.tenantId && row.projectIds.includes(projectId));
  return existing ? { id: existing.id, name: existing.name } : null;
}

export async function proposeConstructionChange(input: z.input<typeof proposalSchema>): Promise<Result> {
  return withDurableMutation(async () => {
    const access = await gate('create'); if (!('actor' in access)) return { ok: false, error: access.error };
    const parsed = proposalSchema.safeParse(input); if (!parsed.success) return { ok: false, error: 'Choose a source, cost code, contractor and describe the proposed change.' };
    const data = parsed.data; const actor = access.actor;
    const project = projectFor(actor, data.projectId, 'create');
    if (!project || !['planning', 'active', 'closing'].includes(project.status)) return { ok: false, error: 'This project cannot receive a proposed change.' };
    const source = data.sourceKind === 'rfi'
      ? db.constructionRfis.find((row) => row.id === data.sourceId && row.tenantId === actor.tenantId && row.projectId === project.id && row.status !== 'draft' && rfiInScope(actor, row))
      : db.constructionIssues.find((row) => row.id === data.sourceId && row.tenantId === actor.tenantId && row.projectId === project.id && rfiPackageAllowed(actor, project, row.workPackageId));
    if (!source) return { ok: false, error: 'The linked RFI or site issue is unavailable in this project.' };
    const workPackageId = source.workPackageId;
    if (!rfiPackageAllowed(actor, project, workPackageId)) return { ok: false, error: 'This work package is outside your assignment.' };
    const costCode = db.constructionCostCodes.find((row) => row.tenantId === actor.tenantId && row.projectId === project.id && row.code === data.costCode);
    const packageCode = project.mobilisation?.workPackages.find((row) => row.id === workPackageId)?.costCode;
    if (!costCode || workPackageId && (!packageCode || packageCode !== costCode.code)) return { ok: false, error: 'Map the source work package to its cost code before proposing a change.' };
    const contractor = contractorFor(actor, project.id, data.subcontractorId);
    if (!contractor) return { ok: false, error: 'Choose an approved contractor assigned to this project.' };
    if (actor.companyAccess?.operationalProfileId === 'subcontractor' && !actor.constructionSubcontractorIds?.includes(contractor.id)) return { ok: false, error: 'You can propose changes only for your assigned contractor.' };
    const seq = nextRecordSequence('construction:changeSeq', 0, true);
    const order: Variation = { tenantId: actor.tenantId! as Variation['tenantId'], id: `co-${randomUUID()}`, ref: `CO-${String(seq).padStart(4, '0')}`, projectId: project.id,
      title: data.title, reason: data.reason, costImpact: money(0), scheduleImpactDays: 0, status: 'draft', raisedISO: operatingDateISO(),
      workPackageId, subcontractorId: contractor.id,
      changeOrder: { sourceKind: data.sourceKind, sourceId: source.id, sourceRef: 'ref' in source ? source.ref : source.title,
        workPackageId, costCode: costCode.code, subcontractorId: contractor.id, subcontractorName: contractor.name,
        proposedBy: actor.userId, proposedAtISO: operatingNowISO() } };
    db.constructionVariations.unshift(order); audit(actor, order, 'issue', `Proposed from ${data.sourceKind} ${order.changeOrder!.sourceRef}`);
    refresh(); return { ok: true, ref: order.ref };
  }, 'construction');
}

export async function requestConstructionChangePricing(orderId: string): Promise<Result> {
  return withDurableMutation(async () => {
    const access = await gate('update'); if (!('actor' in access)) return { ok: false, error: access.error };
    if (!profile(access.actor, ['project-director', 'project-manager', 'quantity-surveyor'])) return { ok: false, error: 'Project commercial management must request contractor pricing.' };
    const order = orderFor(access.actor, orderId);
    if (!order || order.status !== 'draft') return { ok: false, error: 'Only a draft change can be sent for pricing.' };
    if (!contractorFor(access.actor, order.projectId, order.changeOrder!.subcontractorId)) return { ok: false, error: 'The assigned contractor is no longer approved.' };
    order.status = 'pricing_requested'; order.changeOrder!.pricingRequestedBy = access.actor.userId; order.changeOrder!.pricingRequestedAtISO = operatingNowISO();
    audit(access.actor, order, 'record', `Pricing requested from ${order.changeOrder!.subcontractorName}`);
    refresh(); return { ok: true, ref: order.ref };
  }, 'construction');
}

export async function submitConstructionChangeQuote(orderId: string, input: z.input<typeof quoteSchema>): Promise<Result> {
  return withDurableMutation(async () => {
    const access = await gate('update'); if (!('actor' in access)) return { ok: false, error: access.error };
    const parsed = quoteSchema.safeParse(input); if (!parsed.success) return { ok: false, error: 'Enter a contractor quote amount, reference and scope.' };
    const order = orderFor(access.actor, orderId);
    if (!order || order.status !== 'pricing_requested') return { ok: false, error: 'Pricing was not requested for this change.' };
    const assigned = access.actor.companyAccess?.operationalProfileId === 'subcontractor' && access.actor.constructionSubcontractorIds?.includes(order.changeOrder!.subcontractorId);
    const recordedOnBehalf = !assigned && profile(access.actor, ['project-director', 'project-manager', 'quantity-surveyor']);
    if (!assigned && !recordedOnBehalf) return { ok: false, error: 'Only the assigned contractor or project commercial team can record this quotation.' };
    const minor = amount(parsed.data.amountNaira); if (!minor) return { ok: false, error: 'The quotation amount is outside the supported range.' };
    order.status = 'priced'; order.costImpact = money(minor);
    order.changeOrder!.quote = { amountMinor: minor, reference: parsed.data.reference, scope: parsed.data.scope,
      submittedBy: access.actor.userId, submittedAtISO: operatingNowISO(), recordedOnBehalf: Boolean(recordedOnBehalf) };
    audit(access.actor, order, 'record', `Contractor quote ${parsed.data.reference} ${recordedOnBehalf ? 'recorded on behalf' : 'submitted'}`, minor);
    refresh(); return { ok: true, ref: order.ref };
  }, 'construction');
}

export async function assessConstructionChange(orderId: string, input: z.input<typeof assessmentSchema>): Promise<Result> {
  return withDurableMutation(async () => {
    const access = await gate('approve'); if (!('actor' in access)) return { ok: false, error: access.error };
    if (!profile(access.actor, ['quantity-surveyor', 'project-director'])) return { ok: false, error: 'A quantity surveyor or project director must assess this change.' };
    const parsed = assessmentSchema.safeParse(input); if (!parsed.success) return { ok: false, error: 'Enter the assessed NGN budget, schedule impact and review note.' };
    const order = orderFor(access.actor, orderId);
    if (!order || order.status !== 'priced' || !order.changeOrder?.quote) return { ok: false, error: 'A contractor quote is required before commercial assessment.' };
    if (order.changeOrder.proposedBy === access.actor.userId || order.changeOrder.quote.submittedBy === access.actor.userId) return { ok: false, error: 'A different company member must assess the proposal and quote.' };
    const minor = amount(parsed.data.budgetDeltaNaira);
    if (!minor || minor < order.changeOrder.quote.amountMinor) return { ok: false, error: 'The assessed budget must cover the contractor commitment.' };
    order.status = 'client_review'; order.scheduleImpactDays = parsed.data.scheduleDays;
    order.changeOrder.assessment = { budgetDeltaMinor: minor, scheduleDays: parsed.data.scheduleDays, note: parsed.data.note,
      assessedBy: access.actor.userId, assessedAtISO: operatingNowISO() };
    audit(access.actor, order, 'approve', `Commercial assessment submitted for client decision`, minor);
    refresh(); return { ok: true, ref: order.ref };
  }, 'construction');
}

export async function decideConstructionChange(orderId: string, input: z.input<typeof decisionSchema>): Promise<Result> {
  return withDurableMutation(async () => {
    const access = await gate('approve'); if (!('actor' in access)) return { ok: false, error: access.error };
    if (!profile(access.actor, ['project-director', 'project-manager', 'consultant-approver'])) return { ok: false, error: 'Project leadership must record the client decision.' };
    const parsed = decisionSchema.safeParse(input); if (!parsed.success) return { ok: false, error: 'Record the client decision, written reference and note.' };
    const order = orderFor(access.actor, orderId);
    if (!order || order.status !== 'client_review' || !order.changeOrder?.assessment) return { ok: false, error: 'The commercial assessment must be complete first.' };
    if (order.changeOrder.assessment.assessedBy === access.actor.userId) return { ok: false, error: 'The commercial assessor cannot record the client decision.' };
    order.changeOrder.clientDecision = { ...parsed.data, decidedBy: access.actor.userId, decidedAtISO: operatingNowISO() };
    order.status = parsed.data.decision === 'approved' ? 'ready_to_post' : 'rejected';
    audit(access.actor, order, parsed.data.decision === 'approved' ? 'approve' : 'reject', `Client decision ${parsed.data.decision}: ${parsed.data.reference}`, order.changeOrder.assessment.budgetDeltaMinor);
    refresh(); return { ok: true, ref: order.ref };
  }, 'construction');
}

export async function postConstructionChange(orderId: string, input: z.input<typeof postingSchema>): Promise<Result> {
  return withDurableMutation(async () => {
    const access = await gate('approve'); if (!('actor' in access)) return { ok: false, error: access.error };
    if (!profile(access.actor, ['construction-finance', 'project-director'])) return { ok: false, error: 'Finance or project leadership must authorize budget posting.' };
    const parsed = postingSchema.safeParse(input); if (!parsed.success) return { ok: false, error: 'Enter the signed authorization reference.' };
    const order = orderFor(access.actor, orderId);
    const control = order?.changeOrder;
    if (!order || order.status !== 'ready_to_post' || !control?.quote || !control.assessment || control.clientDecision?.decision !== 'approved' || control.posting) return { ok: false, error: 'A priced, assessed and client-approved change is required.' };
    if ([control.proposedBy, control.quote.submittedBy, control.assessment.assessedBy, control.clientDecision.decidedBy].includes(access.actor.userId)) return { ok: false, error: 'A separate finance or director member must authorize the ledger posting.' };
    const project = projectFor(access.actor, order.projectId, 'update');
    const code = db.constructionCostCodes.find((row) => row.tenantId === access.actor.tenantId && row.projectId === order.projectId && row.code === control.costCode);
    if (!project || !code || !['active', 'closing'].includes(project.status)) return { ok: false, error: 'The project and linked cost code must be active for posting.' };
    const beforeBudget = project.approvedBudget.minor, beforeCommitment = code.committed.minor;
    const newBudget = beforeBudget + control.assessment.budgetDeltaMinor, newCodeBudget = code.budget.minor + control.assessment.budgetDeltaMinor;
    const newCommitment = beforeCommitment + control.quote.amountMinor;
    if (![newBudget, newCodeBudget, newCommitment].every(Number.isSafeInteger)) return { ok: false, error: 'This change exceeds the supported ledger range.' };
    const codes = db.constructionCostCodes.filter((row) => row.tenantId === access.actor.tenantId && row.projectId === project.id);
    const beforeEvm = projectEVMOf(project, codes);
    const beforeForecast = forecastFinishISO(project, beforeEvm.spi).iso;
    const newCostForecast = beforeEvm.eac + control.quote.amountMinor;
    if (!Number.isSafeInteger(newCostForecast)) return { ok: false, error: 'This change exceeds the supported forecast range.' };
    project.approvedBudget = money(newBudget); code.budget = money(newCodeBudget); code.committed = money(newCommitment);
    project.approvedChangeDays = (project.approvedChangeDays ?? 0) + control.assessment.scheduleDays;
    project.approvedChangeForecastMinor = newCostForecast;
    const afterEvm = projectEVMOf(project, codes);
    const afterForecast = forecastFinishISO(project, afterEvm.spi).iso;
    order.status = 'approved'; order.costImpact = money(control.assessment.budgetDeltaMinor); order.scheduleImpactDays = control.assessment.scheduleDays;
    control.posting = { authorizationReference: parsed.data.reference, budgetBeforeMinor: beforeBudget, budgetAfterMinor: newBudget, commitmentBeforeMinor: beforeCommitment,
      commitmentAfterMinor: newCommitment, costForecastBeforeMinor: beforeEvm.eac, costForecastAfterMinor: afterEvm.eac,
      forecastBeforeISO: beforeForecast, forecastAfterISO: afterForecast,
      postedBy: access.actor.userId, postedAtISO: operatingNowISO() };
    audit(access.actor, order, 'post_cost', `Authorized ${parsed.data.reference}: budget +${control.assessment.budgetDeltaMinor} kobo, commitment +${control.quote.amountMinor} kobo; forecast ${beforeForecast} → ${afterForecast}`, control.assessment.budgetDeltaMinor);
    refresh(); return { ok: true, ref: order.ref };
  }, 'construction');
}
