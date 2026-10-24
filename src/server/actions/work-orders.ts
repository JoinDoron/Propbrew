'use server';

/**
 * Work-order transition — the one genuinely end-to-end write in the app.
 *
 * Two independent gates, both server-side (SC-01 deny-by-default):
 *   1. §7 capability — the actor must hold `work_orders : transition` (removes
 *      view-only roles like Executive, and scopes O roles to their own rows).
 *   2. §10 machine — the (status, event) edge must exist AND list one of the
 *      actor's roles as a permitted actor. This is where "a technician cannot
 *      triage" and "a resident may only verify/cancel their own" are enforced.
 *
 * Every accepted transition is appended to the audit trail, timestamped and
 * actor-attributed, exactly as §10 requires.
 */

import { revalidatePath } from 'next/cache';
import { getActor } from '@/server/session';
import { ForbiddenError, assertCan } from '@/lib/authz';
import { repos } from '@/server/data';
import { recordHistory } from '@/server/data/store';
import { facilityAssignees } from '@/server/facility-guards';
import { workOrderMachine } from '@/domain/workflows';
import { ROLE_LABELS } from '@/lib/authz';
import type { Role } from '@/domain/enums';
import { nowISO } from '@/server/clock';

export type TransitionResult = { ok: true; to: string } | { ok: false; error: string };

export async function fireWoTransition(
  ref: string,
  event: string,
  opts?: { assignee?: string; note?: string },
): Promise<TransitionResult> {
  const actor = await getActor();

  // Gate 1 — capability. transition is not in the V action set, so view-only
  // roles are rejected here before the machine is even consulted.
  try {
    assertCan(actor, 'work_orders', 'transition');
  } catch (e) {
    if (e instanceof ForbiddenError) return { ok: false, error: 'You do not have permission to change work orders.' };
    throw e;
  }

  // Scoped load — a resident/vendor can only reach their own rows.
  const wo = repos.workOrders.getByRef(actor, ref);
  if (!wo) return { ok: false, error: 'Work order not found.' };

  // Gate 2 — the §10 machine. Legal edge AND permitted for one of my roles.
  const transition = workOrderMachine.transitions.find(
    (t) => t.from === wo.status && t.event === event && t.actors.some((a) => (actor.roles as Role[]).includes(a as Role)),
  );
  if (!transition) {
    return { ok: false, error: `“${event}” is not a legal move from “${wo.status}” for your role.` };
  }

  // Resolve every assignment before changing the live row. A refused request
  // must not silently move its status or clear its existing owner.
  let assignment: ReturnType<typeof facilityAssignees>[number] | undefined;
  if (event === 'ASSIGN' || event === 'REASSIGN') {
    const name = typeof opts?.assignee === 'string' ? opts.assignee.trim() : '';
    assignment = facilityAssignees(wo.tenantId, wo.siteId).find((candidate) => candidate.assigneeName === name);
    if (!assignment) return { ok: false, error: 'Choose an active technician assigned to this site or a vendor with valid compliance.' };
    if (event === 'REASSIGN' && assignment.assigneeUserId === wo.assigneeUserId && assignment.vendorOrgId === wo.vendorOrgId) {
      return { ok: false, error: 'Choose a different assignee.' };
    }
  }

  const from = wo.status;
  wo.status = transition.to;
  if (assignment) Object.assign(wo, assignment);
  Object.assign(wo, { updatedAt: nowISO(), updatedBy: actor.userId });

  const firingRole = (actor.roles as Role[]).find((r) => (transition.actors as string[]).includes(r)) ?? actor.roles[0];
  recordHistory('work-order', wo.id, {
    at: nowISO(),
    event,
    from,
    to: transition.to,
    actorId: actor.userId,
    actorName: ROLE_LABELS[firingRole] ?? actor.userId,
    actorRole: firingRole,
    note: opts?.note,
  });

  revalidatePath('/work-orders');
  revalidatePath(`/work-orders/${ref}`);
  revalidatePath('/estate/work-orders');
  revalidatePath(`/estate/work-orders/${ref}`);
  revalidatePath('/people');
  revalidatePath('/dashboard');
  revalidatePath('/facility');
  revalidatePath('/estate');
  revalidatePath('/portal');
  revalidatePath('/portal/requests');
  return { ok: true, to: transition.to };
}
