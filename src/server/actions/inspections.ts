'use server';

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
import { repos } from '@/server/data';
import { db } from '@/server/data/store';
import { NOW, addDaysISO, SEVERITY_PRIORITY } from '@/domain/inspections';
import { INSPECTION_TEMPLATES, templateChecklist } from '@/domain/inspection-templates';

export type InspResult = { ok: true; raised?: number; passed?: boolean } | { ok: false; error: string };

const REVALIDATE = ['/inspections', '/work-orders', '/dashboard'];
let woCounter = 0;

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
  const actor = await getActor();
  const denied = gate(actor);
  if (denied) return denied;

  const insp = repos.inspections.list(actor).items.find((i) => i.id === inspectionId);
  if (!insp) return { ok: false, error: 'Inspection not found.' };
  const live = db.inspections.find((i) => i.id === inspectionId)!;

  // server-side re-validation: every item must be marked
  const byId = new Map(input.results.map((r) => [r.itemId, r]));
  if (live.checklist.some((c) => !byId.has(c.id) || !byId.get(c.id)!.result)) {
    return { ok: false, error: 'Every checklist item must be marked pass, fail or n/a.' };
  }

  // apply results
  const applied = live.checklist.map((c) => ({ ...c, result: byId.get(c.id)!.result, note: byId.get(c.id)!.note }));
  const failed = applied.filter((c) => c.result === 'fail');
  // require an evidence photo when any item demanded one
  if (applied.some((c) => c.requiresPhoto && c.result !== 'na') && input.photoCount < 1) {
    return { ok: false, error: 'An evidence photo is required for this inspection.' };
  }

  // auto-raise a work order per failed item
  const refs: string[] = [];
  const now = new Date().toISOString();
  for (const item of failed) {
    const ref = `WO-I${8500 + woCounter++}`;
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
    const ob = db.complianceObligations.find((o) => o.id === live.obligationId);
    if (ob) {
      ob.validUntil = addDaysISO(NOW, ob.cadenceDays);
      ob.lastInspectionRef = live.ref;
    }
  }

  REVALIDATE.forEach((p) => revalidatePath(p));
  return { ok: true, raised: refs.length, passed: failed.length === 0 };
}

let inspCounter = 0;

/** Schedule a NEW inspection against an obligation (FM-06 ad-hoc/scheduled runs).
 *  Builds a fresh checklist from the obligation's template. */
export async function scheduleInspection(input: { obligationId: string; date: string; inspector: string }): Promise<InspResult> {
  const actor = await getActor();
  const denied = gate(actor);
  if (denied) return denied;

  const ob = repos.complianceObligations.list(actor).items.find((o) => o.id === input.obligationId);
  if (!ob) return { ok: false, error: 'Obligation not found.' };
  if (!input.date) return { ok: false, error: 'Pick a date.' };

  const template = INSPECTION_TEMPLATES[ob.templateKey] ?? INSPECTION_TEMPLATES.general;
  const ref = `INS-${1300 + inspCounter++}`;
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
}

/** Reschedule a scheduled/overdue inspection. */
export async function rescheduleInspection(inspectionId: string, newDate: string): Promise<InspResult> {
  const actor = await getActor();
  const denied = gate(actor);
  if (denied) return denied;
  const insp = repos.inspections.list(actor).items.find((i) => i.id === inspectionId);
  if (!insp) return { ok: false, error: 'Inspection not found.' };
  const live = db.inspections.find((i) => i.id === inspectionId)!;
  live.scheduledDate = newDate;
  live.status = Date.parse(newDate) < Date.parse(NOW) ? 'overdue' : 'scheduled';
  REVALIDATE.forEach((p) => revalidatePath(p));
  return { ok: true };
}
