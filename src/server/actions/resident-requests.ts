'use server';

import { withDurableMutation } from '@/server/data/durable-records';

import { nextRecordSequence } from '@/server/data/record-context';

/**
 * Resident "raise a request" (EM-03, §7 O). A resident may CREATE a work order
 * against their own unit — nothing more; triage/assignment stay manager/tech
 * work. The new order lands in the shared mutable store, so it appears both in
 * the resident's list and on the ops board, and seeds a CREATE audit entry.
 */

import { revalidatePath } from 'next/cache';
import { getActor } from '@/server/session';
import { ForbiddenError, assertCan } from '@/lib/authz';
import { getActiveUnitId } from '@/server/active-unit';
import { repos } from '@/server/data';
import { db, recordHistory } from '@/server/data/store';
import { nextWorkOrderRef } from '@/server/data/store';
import { operatingClock } from '@/server/operating-clock';
import { triageRequest } from '@/domain/resident-portal';
import type { WorkOrder } from '@/domain/entities';
import { nowISO } from '@/server/clock';

export type RaiseResult = { ok: true; ref: string } | { ok: false; error: string };


export async function raiseRequest(input: { title: string; description?: string }): Promise<RaiseResult> {
  return withDurableMutation(async () => {
  const actor = await getActor();
  try {
    assertCan(actor, 'work_orders', 'create'); // resident (§7 O)
  } catch (e) {
    if (e instanceof ForbiddenError) return { ok: false, error: 'You cannot raise a request.' };
    throw e;
  }
  const title = input.title.trim();
  if (!title) return { ok: false, error: 'Please describe the problem.' };

  const unitId = (await getActiveUnitId(actor.unitIds)) ?? actor.unitIds[0];
  if (!unitId) return { ok: false, error: 'No unit is linked to your account.' };

  const triage = triageRequest(`${title} ${input.description ?? ''}`);
  const estateId = actor.estateIds[0] ?? 's-gardens';
  const me = repos.residents.list(actor).items.find((r) => r.userId === actor.userId);
  const ref = nextWorkOrderRef();
  const clock = operatingClock();
  const hrs = (n: number) => new Date(clock.nowMs + n * 3600 * 1000).toISOString();

  const wo = {
    tenantId: actor.tenantId,
    createdAt: clock.iso, createdBy: actor.userId, updatedAt: clock.iso, updatedBy: actor.userId,
    id: `wo-res-${nextRecordSequence('resident-requests:counter', 0, true)}`,
    ref,
    title,
    // The typed detail reached triage and was then dropped, so the technician
    // only ever saw a title. It now travels with the job.
    description: input.description?.trim() || undefined,
    siteId: estateId,
    estateId,
    unitId,
    status: 'new',
    priority: triage.priority,
    origin: 'resident_request',
    requesterUserId: actor.userId,
    requesterName: me?.name ?? 'Resident',
    assigneeName: 'Unassigned',
    respondDueAt: hrs(triage.priority === 'emergency' ? 1 : 4),
    resolveDueAt: hrs(triage.etaHours),
    cost: null,
  } as unknown as WorkOrder;

  db.workOrders.unshift(wo);
  recordHistory('work-order', wo.id, {
    at: nowISO(), event: 'CREATE', from: null, to: 'new',
    actorId: actor.userId, actorName: me?.name ?? 'Resident', actorRole: 'resident',
    note: `${triage.category.label}${triage.escalated ? ' · flagged urgent' : ''}`,
  });

  ['/portal/requests', '/portal', '/work-orders', '/estate/work-orders', '/people', '/facility', '/estate', '/dashboard'].forEach((p) => revalidatePath(p));
  return { ok: true, ref };

  }, 'estate');
}
