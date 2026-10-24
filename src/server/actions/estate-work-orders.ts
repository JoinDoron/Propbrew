'use server';

import { createHash } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { assertCan, ForbiddenError, ROLE_LABELS } from '@/lib/authz';
import { requireWorkspace } from '@/server/workspaces';
import { devIdentityEnabled } from '@/server/session';
import { isReviewActor } from '@/server/review-auth';
import { scopedMutableGet } from '@/server/data';
import { db, nextWorkOrderRef, recordHistory } from '@/server/data/store';
import { nowISO } from '@/server/clock';
import type { WorkOrder } from '@/domain/entities';

export type EstateWorkOrderResult = { ok: true; ref: string } | { ok: false; error: string };

const text = (min: number, max: number) => z.string().trim().min(min).max(max)
  .refine((value) => !/[\u0000-\u001f\u007f]/.test(value), 'Control characters are not allowed.');
const schema = z.object({
  siteId: text(1, 160),
  unitId: text(1, 160).optional(),
  title: text(3, 160),
  description: z.string().trim().max(3000)
    .transform((value) => value.replace(/\r\n?/g, '\n'))
    .refine((value) => !/[\u0000-\u0008\u000b-\u001f\u007f]/.test(value), 'Control characters are not allowed.')
    .optional(),
  priority: z.enum(['emergency', 'high', 'routine', 'low']),
  idempotencyKey: z.string().uuid(),
}).strict();

/** Estate request creation in local/sample review workspaces; customer production still requires durable storage. */
export async function createEstateWorkOrder(input: unknown): Promise<EstateWorkOrderResult> {
  const session = await requireWorkspace('estate');
  const actor = session.actor;
  try {
    assertCan(actor, 'work_orders', 'create');
  } catch (error) {
    if (error instanceof ForbiddenError) return { ok: false, error: 'You do not have permission to create estate work orders.' };
    throw error;
  }

  const privateReview = session.key === 'private-review' && isReviewActor(actor);
  if ((process.env.DATA_SOURCE && process.env.DATA_SOURCE !== 'memory')
    || !privateReview && (process.env.NODE_ENV === 'production' || session.key === 'clerk' || !devIdentityEnabled())) {
    return { ok: false, error: 'Durable estate work-order creation is not connected in this environment. No work order was created.' };
  }
  if (!actor.tenantId?.trim()) return { ok: false, error: 'A signed-in organisation assignment is required.' };
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Choose an estate, enter a 3–160 character title, a valid priority and submission key. Unexpected ownership or workflow fields are not accepted.' };
  const { idempotencyKey, ...data } = parsed.data;

  // A Site carries its own estate scope key. The adapter applies both tenant
  // and estate predicates before exposing it, independently of the UI options.
  const site = scopedMutableGet(actor, 'work_orders', db.sites.map((row) => ({ ...row, siteId: row.id })), data.siteId, 'create');
  if (!site || site.kind !== 'estate') return { ok: false, error: 'Choose a property in one of your authorised estates.' };
  const unit = data.unitId
    ? scopedMutableGet(actor, 'work_orders', db.units.map((row) => ({ ...row, unitId: row.id })), data.unitId, 'create')
    : null;
  if (data.unitId && (!unit || unit.siteId !== site.id)) return { ok: false, error: 'Choose a unit belonging to the selected estate.' };

  // Bind retries to the trusted actor and tenant, not just a browser key. This
  // stays with the stored row rather than a second, separately reset receipt.
  const id = `wo-estate-${createHash('sha256').update(JSON.stringify([actor.tenantId, actor.userId, idempotencyKey])).digest('hex')}`;
  const prior = db.workOrders.find((row) => row.id === id);
  const description = data.description || undefined;
  if (prior) {
    if (prior.tenantId !== actor.tenantId || prior.requesterUserId !== actor.userId || prior.siteId !== site.id
      || prior.unitId !== data.unitId || prior.title !== data.title || prior.description !== description || prior.priority !== data.priority) {
      return { ok: false, error: 'This submission key was already used for different details. Close this form and start a new work order.' };
    }
    return { ok: true, ref: prior.ref };
  }

  const ref = nextWorkOrderRef();
  const at = nowISO();
  const actorRole = actor.roles.find((role) => role === 'estate_manager' || role === 'facility_manager')!;
  const requesterName = db.users.find((user) => user.id === actor.userId && user.tenantId === actor.tenantId)?.name ?? session.label;
  const order = {
    id, ref, tenantId: actor.tenantId, title: data.title, description,
    siteId: site.id, estateId: site.id, unitId: unit?.id,
    status: 'new', priority: data.priority, origin: 'manager',
    requesterUserId: actor.userId, requesterName, assigneeName: 'Unassigned',
    respondDueAt: null, resolveDueAt: null, cost: null,
    createdAt: at, createdBy: actor.userId, updatedAt: at, updatedBy: actor.userId,
  } as WorkOrder;
  // Synchronous commit after every validation: no automatic assignment, SLA,
  // financial cost, AI approval or workflow transition is invented here.
  db.workOrders.push(order);
  recordHistory('work-order', order.id, {
    at, event: 'CREATE', from: null, to: 'new', actorId: actor.userId,
    actorName: requesterName || ROLE_LABELS[actorRole], actorRole,
    note: 'Created in the Estate workspace. Priority selected by the manager.',
  });
  for (const path of ['/estate/work-orders', `/estate/work-orders/${ref}`, '/work-orders', `/work-orders/${ref}`, '/estate', '/facility', '/dashboard', '/portal', '/portal/requests', '/people']) revalidatePath(path);
  return { ok: true, ref };
}
