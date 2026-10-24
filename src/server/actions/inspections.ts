'use server';

import { withDurableMutation } from '@/server/data/durable-records';

import { nextRecordSequence } from '@/server/data/record-context';

/**
 * Inspection & compliance actions (FM-06). Gated on inspections_compliance
 * (Facility Manager manages; Technician runs their own on mobile — matches
 * FM-06's "runs on mobile with photo capture"). Running an inspection marks each
 * checklist item pass/fail, AUTO-RAISES a work order per failed item (priority
 * from severity, origin failed_inspection — FM-06→FM-03), and, on a clean pass,
 * RENEWS the linked compliance obligation's expiry.
 */

import { revalidatePath } from 'next/cache';
import { getActor } from '@/server/session';
import { ForbiddenError, assertCan, type Actor } from '@/lib/authz';
import { scopedMutableGet } from '@/server/data';
import { db } from '@/server/data/store';
import { NOW, addDaysISO, SEVERITY_PRIORITY } from '@/domain/inspections';
import { INSPECTION_TEMPLATES, templateChecklist } from '@/domain/inspection-templates';
import { isFacilityDate } from '@/server/facility-guards';

export type InspResult = { ok: true; raised?: number; passed?: boolean } | { ok: false; error: string };

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
  input: { results: { itemId: string; result: 'pass' | 'fail' | 'na'; note?: string }[]; photoCount: number },
): Promise<InspResult> {
  return withDurableMutation(async () => {
  const actor = await getActor();
  const denied = gate(actor);
  if (denied) return denied;

  const insp = scopedMutableGet(actor, 'inspections_compliance', db.inspections, inspectionId, 'transition');
  if (!insp) return { ok: false, error: 'Inspection not found.' };
  if (!['scheduled', 'overdue'].includes(insp.status)) return { ok: false, error: 'Only scheduled or overdue inspections can be completed. Schedule a new inspection for a repeat visit.' };
  const live = insp;
  if (!Array.isArray(input.results) || !Number.isSafeInteger(input.photoCount) || input.photoCount < 0
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
  if (applied.some((c) => c.requiresPhoto && c.result !== 'na') && input.photoCount < 1) {
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
  live.completedDate = NOW;
  live.raisedWorkOrders = refs.length;
  live.raisedWorkOrderRefs = refs;

  // renew the obligation on a clean pass
  if (failed.length === 0) {
    const ob = db.complianceObligations.find((o) => o.tenantId === live.tenantId && o.id === live.obligationId);
    if (ob) {
      ob.validUntil = addDaysISO(NOW, ob.cadenceDays);
      ob.lastInspectionRef = live.ref;
    }
  }

  REVALIDATE.forEach((p) => revalidatePath(p));
  if (refs.length > 0) revalidatePath('/estate');
  return { ok: true, raised: refs.length, passed: failed.length === 0 };

  });
}


/** Schedule a NEW inspection against an obligation (FM-06 ad-hoc/scheduled runs).
 *  Builds a fresh checklist from the obligation's template. */
export async function scheduleInspection(input: { obligationId: string; date: string; inspector: string }): Promise<InspResult> {
  return withDurableMutation(async () => {
  const actor = await getActor();
  const denied = gate(actor);
  if (denied) return denied;

  const ob = scopedMutableGet(actor, 'inspections_compliance', db.complianceObligations, input.obligationId, 'transition');
  if (!ob) return { ok: false, error: 'Obligation not found.' };
  if (!isFacilityDate(input.date)) return { ok: false, error: 'Pick a valid inspection date.' };

  const template = INSPECTION_TEMPLATES[ob.templateKey] ?? INSPECTION_TEMPLATES.general;
  const ref = `INS-${1300 + nextRecordSequence('inspections:inspCounter', 0)}`;
  const status = Date.parse(input.date) < Date.parse(NOW) ? 'overdue' : 'scheduled';

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

  });
}

/** Reschedule a scheduled/overdue inspection. */
export async function rescheduleInspection(inspectionId: string, newDate: string): Promise<InspResult> {
  return withDurableMutation(async () => {
  const actor = await getActor();
  const denied = gate(actor);
  if (denied) return denied;
  const insp = scopedMutableGet(actor, 'inspections_compliance', db.inspections, inspectionId, 'transition');
  if (!insp) return { ok: false, error: 'Inspection not found.' };
  if (!['scheduled', 'overdue'].includes(insp.status)) return { ok: false, error: 'Completed inspections cannot be rescheduled. Schedule a new inspection instead.' };
  if (!isFacilityDate(newDate)) return { ok: false, error: 'Pick a valid inspection date.' };
  const live = insp;
  live.scheduledDate = newDate;
  live.status = Date.parse(newDate) < Date.parse(NOW) ? 'overdue' : 'scheduled';
  REVALIDATE.forEach((p) => revalidatePath(p));
  return { ok: true };

  });
}
