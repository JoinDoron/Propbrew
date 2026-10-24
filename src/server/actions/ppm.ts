'use server';

/**
 * PPM server actions (FM-02 / AI-F-01). Same contract as fireWoTransition: assert
 * the §7 assets_ppm capability (modify = Facility Manager only; V roles are
 * rejected before the store is touched), mutate the in-memory store, and append a
 * recordHistory('ppm', …) audit entry. AI never moves the live schedule itself —
 * decidePpmSuggestion promotes a draft only when the FM approves (§11.4).
 */

import { revalidatePath } from 'next/cache';
import { getActor } from '@/server/session';
import { ForbiddenError, assertCan, ROLE_LABELS, type Actor } from '@/lib/authz';
import { repos } from '@/server/data';
import { db, recordHistory } from '@/server/data/store';
import { NOW, addDays } from '@/domain/ppm';
import type { Role } from '@/domain/enums';
import { nowISO } from '@/server/clock';

export type PpmResult = { ok: true; ref?: string } | { ok: false; error: string };

const REVALIDATE = ['/ppm', '/work-orders', '/estate/work-orders', '/people', '/facility', '/dashboard', '/assets'];
let woCounter = 0;

function gate(actor: Actor): PpmResult | null {
  try {
    assertCan(actor, 'assets_ppm', 'transition'); // FM (M) only; V roles rejected
    return null;
  } catch (e) {
    if (e instanceof ForbiddenError) return { ok: false, error: 'Only the Facility Manager can change maintenance plans.' };
    throw e;
  }
}
function actorName(actor: Actor): string {
  return ROLE_LABELS[(actor.roles as Role[])[0]] ?? actor.userId;
}
function scopedOccurrence(actor: Actor, id: string) {
  return repos.ppmOccurrences.list(actor).items.find((o) => o.id === id) ?? null;
}

/** Generate the work order for an occurrence. Idempotent: no-op if an open
 *  ppm_schedule WO already exists for the asset. */
export async function generatePpmWorkOrder(occurrenceId: string): Promise<PpmResult> {
  const actor = await getActor();
  const denied = gate(actor);
  if (denied) return denied;

  const occ = scopedOccurrence(actor, occurrenceId);
  if (!occ) return { ok: false, error: 'Occurrence not found.' };
  const live = db.ppmOccurrences.find((o) => o.id === occurrenceId)!;

  // idempotency — reuse an existing open PPM work order for this asset
  const existing = db.workOrders.find(
    (w) => String(w.assetId) === String(occ.assetId) && w.origin === 'ppm_schedule' &&
      !['closed', 'cancelled', 'rejected', 'verified'].includes(w.status),
  );
  if (existing) {
    live.status = 'wo_generated';
    live.workOrderRef = existing.ref;
    revalidate();
    return { ok: true, ref: existing.ref };
  }

  const plan = db.ppmPlans.find((p) => p.id === occ.planId);
  const ref = `WO-P${9000 + woCounter++}`;
  const now = new Date().toISOString();
  db.workOrders.push({
    tenantId: occ.tenantId,
    createdAt: now, createdBy: actor.userId, updatedAt: now, updatedBy: actor.userId,
    id: `wo-ppm-${occurrenceId}`,
    ref,
    title: `PPM · ${occ.assetName}`,
    siteId: occ.siteId,
    estateId: occ.siteId,
    assetId: occ.assetId,
    status: plan?.assignee ? 'assigned' : 'new',
    priority: 'routine',
    origin: 'ppm_schedule',
    requesterUserId: actor.userId,
    requesterName: 'PPM Scheduler',
    assigneeName: plan?.assignee ?? 'Unassigned',
    respondDueAt: `${occ.dueDate}T09:00:00Z`,
    resolveDueAt: `${addDays(occ.dueDate, 1)}T18:00:00Z`,
    cost: null,
  } as unknown as (typeof db.workOrders)[number]);

  live.status = 'wo_generated';
  live.workOrderRef = ref;
  recordHistory('ppm', String(occ.planId), hist('GENERATE', 'scheduled', 'wo_generated', actor, `Work order ${ref} generated for ${occ.assetName}`));
  revalidate();
  revalidatePath('/estate');
  return { ok: true, ref };
}

/** Complete an occurrence. Server-side re-validation: every checklist item ticked
 *  and evidence attached when the plan requires it (never trust the client). */
export async function completePpmOccurrence(occurrenceId: string, input: { checkedIds: string[]; photoCount: number }): Promise<PpmResult> {
  const actor = await getActor();
  const denied = gate(actor);
  if (denied) return denied;

  const occ = scopedOccurrence(actor, occurrenceId);
  if (!occ) return { ok: false, error: 'Occurrence not found.' };
  const plan = db.ppmPlans.find((p) => p.id === occ.planId);
  if (!plan) return { ok: false, error: 'Plan not found.' };

  const allTicked = plan.checklist.every((c) => input.checkedIds.includes(c.id));
  if (!allTicked) return { ok: false, error: 'Every checklist item must be completed.' };
  if (plan.evidenceRequired && input.photoCount < 1) return { ok: false, error: 'An evidence photo is required to complete this service.' };

  const live = db.ppmOccurrences.find((o) => o.id === occurrenceId)!;
  live.status = 'completed';
  plan.lastServicedAt = NOW;
  plan.overdue = false;
  plan.nextDue = addDays(NOW, intervalDays(plan.frequency));
  // reset the runtime baseline on the asset's feed
  const rt = db.assetRuntime.find((r) => String(r.assetId) === String(occ.assetId));
  if (rt) rt.runtimeHoursAtLastService = rt.runtimeHours;

  recordHistory('ppm', String(occ.planId), hist('COMPLETE', 'in_progress', 'completed', actor, `Serviced with ${input.checkedIds.length} checks${plan.evidenceRequired ? ` and ${input.photoCount} photo(s)` : ''}`));
  revalidate();
  return { ok: true };
}

/** Reschedule an occurrence. Statutory occurrences clamp at their legal deadline. */
export async function reschedulePpmOccurrence(occurrenceId: string, newDate: string): Promise<PpmResult> {
  const actor = await getActor();
  const denied = gate(actor);
  if (denied) return denied;

  const occ = scopedOccurrence(actor, occurrenceId);
  if (!occ) return { ok: false, error: 'Occurrence not found.' };
  if (occ.statutory && occ.statutoryDeadline && Date.parse(newDate) > Date.parse(occ.statutoryDeadline)) {
    return { ok: false, error: `Statutory inspection cannot be moved past its legal deadline (${occ.statutoryDeadline}).` };
  }

  const live = db.ppmOccurrences.find((o) => o.id === occurrenceId)!;
  const plan = db.ppmPlans.find((p) => p.id === occ.planId);
  const from = live.status;
  live.dueDate = newDate;
  live.generateDate = addDays(newDate, -(plan?.leadTimeDays ?? 0));
  live.status = Date.parse(newDate) < Date.parse(NOW) ? 'overdue' : 'scheduled';
  if (plan) plan.rescheduleCount += 1;
  recordHistory('ppm', String(occ.planId), hist('RESCHEDULE', from, live.status, actor, `Rescheduled ${occ.assetName} to ${newDate}`));
  revalidate();
  return { ok: true };
}

/** HITL for an AI-F-01 suggestion. Approve pulls the plan forward and promotes
 *  the first scheduled occurrence; Override records the FM's reason. Both attribute
 *  the decision to the FM — the AI only proposed (§11.4 / SC-10). */
export async function decidePpmSuggestion(
  assetId: string,
  decision: 'approve' | 'override',
  input: { date?: string; reason?: string; confidence?: number; driver?: string },
): Promise<PpmResult> {
  const actor = await getActor();
  const denied = gate(actor);
  if (denied) return denied;

  const plan = repos.ppmPlans.list(actor).items.find((p) => String(p.assetId) === String(assetId));
  if (!plan) return { ok: false, error: 'Plan not found.' };
  const live = db.ppmPlans.find((p) => p.id === plan.id)!;

  const meta = JSON.stringify({ confidence: input.confidence, driver: input.driver, reason: input.reason });

  if (decision === 'approve') {
    if (input.confidence !== undefined && input.confidence < 0.6) {
      return { ok: false, error: 'This suggestion is in shadow mode — not enough data to act on yet.' };
    }
    const newDue = input.date ?? live.nextDue;
    live.nextDue = newDue;
    live.overdue = Date.parse(newDue) < Date.parse(NOW);
    // promote the plan's earliest scheduled occurrence to the pulled-forward date
    const occ = db.ppmOccurrences
      .filter((o) => o.planId === plan.id && o.status !== 'completed')
      .sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1))[0];
    if (occ) {
      occ.dueDate = newDue;
      occ.generateDate = addDays(newDue, -live.leadTimeDays);
      occ.status = live.overdue ? 'overdue' : 'scheduled';
      occ.source = 'plan';
    }
    recordHistory('ppm', plan.id, hist('PROMOTE', 'ai_draft', 'scheduled', actor, `AI_RESCHEDULE_APPROVED ${meta}`));
    revalidate();
    return { ok: true };
  }

  recordHistory('ppm', plan.id, hist('DISMISS', 'ai_draft', 'ai_draft', actor, `AI_OVERRIDDEN ${meta}`));
  revalidate();
  return { ok: true };
}

/** Log a fresh runtime reading (simulated sensor feed). Recomputes the projection. */
export async function logRuntimeReading(assetId: string, addHours: number): Promise<PpmResult> {
  const actor = await getActor();
  const denied = gate(actor);
  if (denied) return denied;
  // scope: only assets the actor can see
  const visible = new Set(repos.assets.list(actor).items.map((a) => String(a.id)));
  if (!visible.has(String(assetId))) return { ok: false, error: 'Asset not found.' };
  const rt = db.assetRuntime.find((r) => String(r.assetId) === String(assetId));
  if (!rt) return { ok: false, error: 'No runtime feed for this asset.' };
  rt.runtimeHours += Math.max(0, addHours);
  rt.lastReadingAt = NOW;
  revalidate();
  return { ok: true };
}

/* --- helpers -------------------------------------------------------------- */

function revalidate() {
  REVALIDATE.forEach((p) => revalidatePath(p));
}
function hist(event: string, from: string, to: string, actor: Actor, note: string) {
  return { at: nowISO(), event, from, to, actorId: actor.userId, actorName: actorName(actor), actorRole: (actor.roles as Role[])[0], note };
}
function intervalDays(freq: string): number {
  return { weekly: 7, monthly: 30, quarterly: 91, biannual: 182, annual: 365 }[freq] ?? 30;
}
