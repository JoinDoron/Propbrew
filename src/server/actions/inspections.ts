'use server';

import { withDurableMutation } from '@/server/data/durable-records';

import { currentRecordContext, nextRecordSequence } from '@/server/data/record-context';

/**
 * Inspection & compliance actions (FM-06). Gated on inspections_compliance
 * (Facility Manager manages; Technician runs their own on mobile — matches
 * FM-06's "runs on mobile with photo capture"). Running an inspection marks each
 * checklist item pass/fail, AUTO-RAISES a work order per failed item (priority
 * from severity, origin failed_inspection — FM-06→FM-03). Native company runs
 * advance the operational check date; certificate expiry stays human-recorded.
 */

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { getActor } from '@/server/session';
import { ForbiddenError, assertCan, type Actor } from '@/lib/authz';
import { scopedMutableGet } from '@/server/data';
import { db, nextWorkOrderRef, recordHistory } from '@/server/data/store';
import { addDaysISO, SEVERITY_PRIORITY } from '@/domain/inspections';
import { operatingDateISO, operatingNowISO } from '@/server/operating-clock';
import { INSPECTION_TEMPLATES, templateChecklist } from '@/domain/inspection-templates';
import { isFacilityDate } from '@/server/facility-guards';
import { complianceDate, complianceText, type FacilityInspectionOperation } from '@/domain/facility/compliance';
import { facilityComplianceState, facilityInspectionOperation, nativeComplianceActor, complianceHash, complianceChecklistHash } from '@/server/reads/facility-compliance';
import { resolveFacilityEvidence } from '@/server/facility/evidence';

export type InspResult = { ok: true; id?: string; ref?: string; raised?: number; passed?: boolean } | { ok: false; error: string };

const REVALIDATE = ['/inspections', '/estate/inspections', '/work-orders', '/estate/work-orders', '/people', '/facility', '/dashboard'];

function gate(actor: Actor): InspResult | null {
  try {
    assertCan(actor, 'inspections_compliance', 'transition');
    return null;
  } catch (e) {
    if (e instanceof ForbiddenError) return { ok: false, error: 'You do not have permission to run inspections.' };
    throw e;
  }
}

export async function runInspection(
  inspectionId: string,
  input: { results: { itemId: string; result: 'pass' | 'fail' | 'na'; note?: string }[]; photoCount?: number; expectedCompanyId?: string; idempotencyKey?: string; expectedVersion?: number; expectedChecklistHash?: string; evidenceIds?: string[] },
): Promise<InspResult> {
  return withDurableMutation(async () => {
  const actor = await getActor();
  const denied = gate(actor);
  if (denied) return denied;

  const insp = scopedMutableGet(actor, 'inspections_compliance', db.inspections, inspectionId, 'transition');
  if (!insp) return { ok: false, error: 'Inspection not found.' };
  if (nativeComplianceActor(actor) || facilityComplianceState().configurations.some((row) => row.tenantId === actor.tenantId && row.obligationId === insp.obligationId)) return runNativeInspection(actor, insp, input);
  if (!['scheduled', 'overdue'].includes(insp.status)) return { ok: false, error: 'Only scheduled or overdue inspections can be completed. Schedule a new inspection for a repeat visit.' };
  const live = insp;
  if (!input || typeof input !== 'object') return { ok: false, error: 'Provide valid inspection results.' };
  const photoCount = input.photoCount;
  if (!Array.isArray(input.results) || typeof photoCount !== 'number' || !Number.isSafeInteger(photoCount) || photoCount < 0
    || input.results.some((row) => !row || !['pass', 'fail', 'na'].includes(row.result) || !live.checklist.some((item) => item.id === row.itemId))
    || new Set(input.results.map((row) => row.itemId)).size !== input.results.length) return { ok: false, error: 'Provide valid, unique checklist results and a non-negative whole evidence count.' };

  // server-side re-validation: every item must be marked
  const byId = new Map(input.results.map((r) => [r.itemId, r]));
  if (live.checklist.some((c) => !byId.has(c.id) || !byId.get(c.id)!.result)) {
    return { ok: false, error: 'Every checklist item must be marked pass, fail or n/a.' };
  }

  // apply results
  const applied = live.checklist.map((c) => ({ ...c, result: byId.get(c.id)!.result, note: byId.get(c.id)!.note }));
  const failed = applied.filter((c) => c.result === 'fail');
  if (!applied.some((item) => item.result !== 'na')) return { ok: false, error: 'At least one applicable checklist item is required to complete this inspection.' };
  // require an evidence photo when any item demanded one
  if (applied.some((c) => c.requiresPhoto && c.result !== 'na') && photoCount < 1) {
    return { ok: false, error: 'An evidence photo is required for this inspection.' };
  }

  // auto-raise a work order per failed item
  const refs: string[] = [];
  const now = new Date().toISOString();
  for (const item of failed) {
    const ref = `WO-I${8500 + nextRecordSequence('inspections:woCounter', 0)}`;
    db.workOrders.push({
      tenantId: live.tenantId,
      createdAt: now, createdBy: actor.userId, updatedAt: now, updatedBy: actor.userId,
      id: `wo-insp-${inspectionId}-${item.id}`,
      ref,
      title: `${live.template}: ${item.label}`,
      siteId: live.siteId,
      estateId: live.estateId,
      assetId: live.assetId,
      status: 'new',
      priority: SEVERITY_PRIORITY[item.severity],
      origin: 'failed_inspection',
      requesterUserId: actor.userId,
      requesterName: live.inspector,
      assigneeName: 'Unassigned',
      respondDueAt: null,
      resolveDueAt: null,
      cost: null,
    } as unknown as (typeof db.workOrders)[number]);
    refs.push(ref);
  }

  live.checklist = applied;
  live.passItems = applied.filter((c) => c.result === 'pass').length;
  live.failItems = failed.length;
  live.status = failed.length > 0 ? 'failed' : 'passed';
  live.completedDate = operatingDateISO();
  live.raisedWorkOrders = refs.length;
  live.raisedWorkOrderRefs = refs;

  // renew the obligation on a clean pass
  if (failed.length === 0) {
    const ob = db.complianceObligations.find((o) => o.tenantId === live.tenantId && o.id === live.obligationId);
    if (ob) {
      ob.validUntil = addDaysISO(operatingDateISO(), ob.cadenceDays);
      ob.lastInspectionRef = live.ref;
    }
  }

  REVALIDATE.forEach((p) => revalidatePath(p));
  if (refs.length > 0) revalidatePath('/estate');
  return { ok: true, raised: refs.length, passed: failed.length === 0 };

  }, 'facility');
}


/** Schedule a NEW inspection against an obligation (FM-06 ad-hoc/scheduled runs).
 *  Builds a fresh checklist from the obligation's template. */
export async function scheduleInspection(input: { obligationId: string; date: string; inspector: string; expectedCompanyId?: string; idempotencyKey?: string; expectedObligationVersion?: number }): Promise<InspResult> {
  return withDurableMutation(async () => {
  const actor = await getActor();
  const denied = gate(actor);
  if (denied) return denied;

  if (!input || typeof input !== 'object' || typeof input.obligationId !== 'string') return { ok: false, error: 'Choose an available obligation.' };
  const ob = scopedMutableGet(actor, 'inspections_compliance', db.complianceObligations, input.obligationId, 'transition');
  if (!ob) return { ok: false, error: 'Obligation not found.' };
  if (nativeComplianceActor(actor) || facilityComplianceState().configurations.some((row) => row.tenantId === actor.tenantId && row.obligationId === ob.id)) return scheduleNativeInspection(actor, ob, input);
  if (!isFacilityDate(input.date)) return { ok: false, error: 'Pick a valid inspection date.' };

  const template = INSPECTION_TEMPLATES[ob.templateKey] ?? INSPECTION_TEMPLATES.general;
  const ref = `INS-${1300 + nextRecordSequence('inspections:inspCounter', 0)}`;
  const status = input.date < operatingDateISO() ? 'overdue' : 'scheduled';

  db.inspections.push({
    tenantId: ob.tenantId,
    id: `insp-new-${ref}`,
    ref,
    template: template.name,
    obligationId: ob.id,
    criticality: ob.criticality,
    siteId: ob.siteId,
    estateId: ob.estateId,
    assetId: ob.assetId,
    assetName: ob.scopeLabel,
    status,
    scheduledDate: input.date,
    checklist: templateChecklist(ob.templateKey),
    passItems: 0,
    failItems: 0,
    inspector: input.inspector || 'Unassigned',
    raisedWorkOrders: 0,
    raisedWorkOrderRefs: [],
  } as unknown as (typeof db.inspections)[number]);

  REVALIDATE.forEach((p) => revalidatePath(p));
  return { ok: true };

  }, 'facility');
}

/** Reschedule a scheduled/overdue inspection. */
export async function rescheduleInspection(inspectionId: string, newDate: string, binding?: { expectedCompanyId: string; idempotencyKey: string; expectedVersion: number; expectedDate: string }): Promise<InspResult> {
  return withDurableMutation(async () => {
  const actor = await getActor();
  const denied = gate(actor);
  if (denied) return denied;
  const insp = scopedMutableGet(actor, 'inspections_compliance', db.inspections, inspectionId, 'transition');
  if (!insp) return { ok: false, error: 'Inspection not found.' };
  if (nativeComplianceActor(actor) || facilityComplianceState().configurations.some((row) => row.tenantId === actor.tenantId && row.obligationId === insp.obligationId)) return rescheduleNativeInspection(actor, insp, newDate, binding);
  if (!['scheduled', 'overdue'].includes(insp.status)) return { ok: false, error: 'Completed inspections cannot be rescheduled. Schedule a new inspection instead.' };
  if (!isFacilityDate(newDate)) return { ok: false, error: 'Pick a valid inspection date.' };
  const live = insp;
  live.scheduledDate = newDate;
  live.status = newDate < operatingDateISO() ? 'overdue' : 'scheduled';
  REVALIDATE.forEach((p) => revalidatePath(p));
  return { ok: true };

  }, 'facility');
}

const nativeRunSchema = z.strictObject({
  expectedCompanyId: complianceText(1, 160), idempotencyKey: z.uuid(), expectedVersion: z.number().int().min(1), expectedChecklistHash: z.string().length(64),
  photoCount: z.number().int().min(0).max(0).optional(), evidenceIds: z.array(z.uuid()).max(20).default([]),
  results: z.array(z.strictObject({ itemId: complianceText(1, 80), result: z.enum(['pass', 'fail', 'na']), note: z.string().trim().max(2000).refine((value) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)).optional() })).min(1).max(60),
});
function inspectionReceipt(actor: Actor, operation: string, key: string, payload: unknown) {
  const state = facilityComplianceState(), payloadHash = complianceHash(payload);
  const saved = state.receipts.find((row) => row.tenantId === actor.tenantId && row.actorId === actor.userId && row.key === key);
  return { state, payloadHash, prior: saved ? saved.operation === operation && saved.payloadHash === payloadHash ? saved.result : { ok: false as const, error: 'This submission key was already used with different inspection details.' } : undefined };
}
function saveInspectionReceipt(actor: Actor, operation: string, key: string, payloadHash: string, result: InspResult) {
  facilityComplianceState().receipts.push({ tenantId: actor.tenantId!, actorId: actor.userId, operation, key, payloadHash, result });
}
async function scheduleNativeInspection(actor: Actor, obligation: (typeof db.complianceObligations)[number], input: unknown): Promise<InspResult> {
  const parsed = z.strictObject({ obligationId: complianceText(1, 160), date: complianceDate, inspector: complianceText(2, 120), expectedCompanyId: complianceText(1, 160), idempotencyKey: z.uuid(), expectedObligationVersion: z.number().int().min(1) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Choose an inspector, real inspection date and the latest company obligation.' };
  const data = parsed.data;
  if (data.expectedCompanyId !== actor.tenantId) return { ok: false, error: 'The company changed. Reopen inspection scheduling.' };
  const receipt = inspectionReceipt(actor, 'inspection.schedule', data.idempotencyKey, data); if (receipt.prior) return receipt.prior;
  const config = receipt.state.configurations.find((row) => row.tenantId === actor.tenantId && row.obligationId === obligation.id);
  if ((config?.version ?? 1) !== data.expectedObligationVersion) return { ok: false, error: 'This obligation changed. Reload its latest inspection requirements.' };
  if (db.inspections.some((row) => row.tenantId === actor.tenantId && row.obligationId === obligation.id && ['scheduled', 'overdue', 'in_progress'].includes(row.status))) return { ok: false, error: 'This obligation already has an open inspection. Run or reschedule that inspection first.' };
  const checklist = (config?.checklist ?? templateChecklist(obligation.templateKey)).map((item) => ({ ...item, result: null }));
  const id = `inspection-${randomUUID()}`, at = operatingNowISO();
  const highest = db.inspections.reduce((max, row) => Math.max(max, Number.parseInt(row.ref.replace(/^INS-/, ''), 10) || 0), 1300);
  const ref = `INS-${highest + 1}`;
  const row = { tenantId: actor.tenantId!, id, ref, template: config?.templateName ?? INSPECTION_TEMPLATES[obligation.templateKey].name,
    obligationId: obligation.id, criticality: obligation.criticality, siteId: obligation.siteId, estateId: obligation.estateId, assetId: obligation.assetId, assetName: obligation.scopeLabel,
    status: data.date < operatingDateISO() ? 'overdue' : 'scheduled', scheduledDate: data.date, checklist, passItems: 0, failItems: 0, inspector: data.inspector, raisedWorkOrders: 0, raisedWorkOrderRefs: [] } as unknown as (typeof db.inspections)[number];
  const operation: FacilityInspectionOperation = { tenantId: actor.tenantId!, inspectionId: id, obligationId: obligation.id, version: 1, obligationVersion: config?.version ?? 1,
    checklistHash: complianceChecklistHash(checklist), scopeHash: complianceHash([obligation.siteId, obligation.estateId, obligation.assetId ?? null]), scheduledDate: data.date, cadenceDays: obligation.cadenceDays, evidenceIds: [] };
  db.inspections.push(row); receipt.state.runs.push(operation);
  receipt.state.audit.push({ tenantId: actor.tenantId!, actorId: actor.userId, obligationId: obligation.id, inspectionId: id, action: 'inspection.scheduled', at });
  const result = { ok: true as const, id, ref }; saveInspectionReceipt(actor, 'inspection.schedule', data.idempotencyKey, receipt.payloadHash, result); REVALIDATE.forEach((path) => revalidatePath(path)); return result;
}
async function runNativeInspection(actor: Actor, inspection: (typeof db.inspections)[number], input: unknown): Promise<InspResult> {
  const parsed = nativeRunSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Review the latest checklist and attach actual evidence files. A claimed photo count is not evidence.' };
  const data = parsed.data;
  if (data.expectedCompanyId !== actor.tenantId) return { ok: false, error: 'The company changed. Reopen this inspection.' };
  const receipt = inspectionReceipt(actor, 'inspection.run', data.idempotencyKey, { inspectionId: inspection.id, ...data }); if (receipt.prior) return receipt.prior;
  const operation = facilityInspectionOperation(actor, inspection.id);
  const obligation = scopedMutableGet(actor, 'inspections_compliance', db.complianceObligations, inspection.obligationId, 'transition');
  if (!operation || !obligation || !['scheduled', 'overdue'].includes(inspection.status)) return { ok: false, error: 'Only an available scheduled or overdue inspection can be completed.' };
  if (operation.version !== data.expectedVersion || operation.scheduledDate !== inspection.scheduledDate || operation.checklistHash !== data.expectedChecklistHash || operation.checklistHash !== complianceChecklistHash(inspection.checklist)
    || operation.scopeHash !== complianceHash([obligation.siteId, obligation.estateId, obligation.assetId ?? null])
    || operation.scopeHash !== complianceHash([inspection.siteId, inspection.estateId, inspection.assetId ?? null])) return { ok: false, error: 'The inspection date, checklist or obligation scope changed. Reload before submitting.' };
  const results = new Map(data.results.map((row) => [row.itemId, row]));
  if (results.size !== data.results.length || results.size !== inspection.checklist.length || inspection.checklist.some((item) => !results.has(item.id))) return { ok: false, error: 'Mark every checklist item exactly once.' };
  if (data.results.some((row) => row.result !== 'pass' && (row.note?.length ?? 0) < 3)) return { ok: false, error: 'Record a finding for each failed item and a reason for each not-applicable item.' };
  if (!data.results.some((row) => row.result !== 'na')) return { ok: false, error: 'At least one applicable check is required.' };
  const evidence = resolveFacilityEvidence(actor, 'obligation', obligation.id, data.evidenceIds);
  if (!evidence) return { ok: false, error: 'Evidence must be saved for this obligation in your authorised company and location.' };
  if (inspection.checklist.some((item) => item.requiresPhoto && results.get(item.id)!.result !== 'na') && !evidence.some((file) => file.kind === 'image')) return { ok: false, error: 'Attach an actual saved image for the required photo evidence before completing this inspection.' };
  const operatorName = currentRecordContext()?.companyPrincipal?.user.name ?? db.users.find((user) => user.id === actor.userId && user.tenantId === actor.tenantId)?.name ?? 'Authorised operator';
  const applied = inspection.checklist.map((item) => ({ ...item, result: results.get(item.id)!.result, note: results.get(item.id)!.note }));
  const failures = applied.filter((item) => item.result === 'fail'), refs: string[] = [], at = operatingNowISO();
  for (const item of failures) {
    const id = `workorder-${randomUUID()}`, ref = nextWorkOrderRef();
    db.workOrders.push({ tenantId: inspection.tenantId, id, ref, title: `${inspection.template}: ${item.label}`.slice(0, 240), description: item.note, siteId: inspection.siteId, estateId: inspection.estateId,
      assetId: inspection.assetId, status: 'new', priority: SEVERITY_PRIORITY[item.severity], origin: 'failed_inspection', requesterUserId: actor.userId, requesterName: operatorName, assigneeName: 'Unassigned',
      respondDueAt: null, resolveDueAt: null, cost: null, createdAt: at, updatedAt: at, createdBy: actor.userId, updatedBy: actor.userId } as unknown as (typeof db.workOrders)[number]);
    recordHistory('work-order', id, { at, event: 'CREATE', from: null, to: 'new', actorId: actor.userId, actorName: operatorName, actorRole: 'facility_manager', note: `Inspection ${inspection.ref}: ${item.note}` }); refs.push(ref);
  }
  inspection.checklist = applied; inspection.passItems = applied.filter((item) => item.result === 'pass').length; inspection.failItems = failures.length;
  inspection.status = failures.length ? 'failed' : 'passed'; inspection.completedDate = operatingDateISO(); inspection.raisedWorkOrders = refs.length; inspection.raisedWorkOrderRefs = refs;
  Object.assign(operation, { version: operation.version + 1, evidenceIds: data.evidenceIds, completedAt: at });
  if (!receipt.state.runs.some((row) => row.tenantId === actor.tenantId && row.inspectionId === inspection.id)) receipt.state.runs.push(operation);
  const config = receipt.state.configurations.find((row) => row.tenantId === actor.tenantId && row.obligationId === obligation.id);
  obligation.lastInspectionRef = inspection.ref;
  if (config) {
    if (!failures.length) config.nextOperationalDue = addDaysISO(operatingDateISO(), operation.cadenceDays);
    config.lastOperationalInspectionRef = inspection.ref; config.version += 1; config.updatedAt = at; config.updatedBy = actor.userId;
  }
  // Certificate expiry is operator-recorded authority evidence. An operational
  // checklist pass must never extend it or claim a regulatory/legal sign-off.
  receipt.state.audit.push({ tenantId: actor.tenantId!, actorId: actor.userId, obligationId: obligation.id, inspectionId: inspection.id, action: failures.length ? 'inspection.failed' : 'inspection.operational_pass', at, note: 'Recorded operational outcome only; certificate validity unchanged.' });
  const result = { ok: true as const, id: inspection.id, ref: inspection.ref, raised: refs.length, passed: failures.length === 0 };
  saveInspectionReceipt(actor, 'inspection.run', data.idempotencyKey, receipt.payloadHash, result); REVALIDATE.forEach((path) => revalidatePath(path)); if (refs.length) revalidatePath('/estate'); return result;
}
async function rescheduleNativeInspection(actor: Actor, inspection: (typeof db.inspections)[number], date: string, binding: unknown): Promise<InspResult> {
  const parsed = z.strictObject({ expectedCompanyId: complianceText(1, 160), idempotencyKey: z.uuid(), expectedVersion: z.number().int().min(1), expectedDate: complianceDate }).safeParse(binding);
  if (!parsed.success || !complianceDate.safeParse(date).success) return { ok: false, error: 'Choose a real date and reload this inspection before rescheduling.' };
  const data = parsed.data;
  if (data.expectedCompanyId !== actor.tenantId) return { ok: false, error: 'The company changed. Reopen this inspection.' };
  const receipt = inspectionReceipt(actor, 'inspection.reschedule', data.idempotencyKey, { inspectionId: inspection.id, date, ...data }); if (receipt.prior) return receipt.prior;
  const operation = facilityInspectionOperation(actor, inspection.id);
  const obligation = scopedMutableGet(actor, 'inspections_compliance', db.complianceObligations, inspection.obligationId, 'transition');
  if (!operation || !obligation || !['scheduled', 'overdue'].includes(inspection.status) || data.expectedVersion !== operation.version || data.expectedDate !== inspection.scheduledDate || operation.scheduledDate !== inspection.scheduledDate
    || operation.scopeHash !== complianceHash([obligation.siteId, obligation.estateId, obligation.assetId ?? null])
    || operation.scopeHash !== complianceHash([inspection.siteId, inspection.estateId, inspection.assetId ?? null])) return { ok: false, error: 'The inspection changed or is already complete. Reload its latest schedule.' };
  inspection.scheduledDate = date; inspection.status = date < operatingDateISO() ? 'overdue' : 'scheduled';
  Object.assign(operation, { scheduledDate: date, version: operation.version + 1 });
  if (!receipt.state.runs.some((row) => row.tenantId === actor.tenantId && row.inspectionId === inspection.id)) receipt.state.runs.push(operation);
  receipt.state.audit.push({ tenantId: actor.tenantId!, actorId: actor.userId, obligationId: inspection.obligationId, inspectionId: inspection.id, action: 'inspection.rescheduled', at: operatingNowISO() });
  const result = { ok: true as const, id: inspection.id, ref: inspection.ref }; saveInspectionReceipt(actor, 'inspection.reschedule', data.idempotencyKey, receipt.payloadHash, result); REVALIDATE.forEach((path) => revalidatePath(path)); return result;
}
