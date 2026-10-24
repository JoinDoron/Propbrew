import 'server-only';

import { assertCan, can, type Actor } from '@/lib/authz';
import type { Page } from '@/domain/primitives';
import type { Site, Unit, WorkOrder } from '@/domain/entities';
import { repos } from '@/server/data';

function allRows<T>(read: (cursor: string | null) => Page<T>): T[] {
  const rows: T[] = [];
  let cursor: string | null = null;
  do {
    const page = read(cursor);
    rows.push(...page.items);
    cursor = page.cursor;
  } while (cursor !== null);
  return rows;
}

/** Estate is a complete workspace, not a redirect into Facility. Repository
 * authorization remains authoritative; Estate membership only narrows it. */
export function listEstateWorkOrderSites(actor: Actor): Site[] {
  assertCan(actor, 'work_orders', 'read');
  // A mixed resident/security identity may have an own-request grant without
  // property visibility. Do not turn that into an asset read or a server error.
  if (!can(actor, 'assets_ppm', 'read').allowed) return [];
  return allRows((cursor) => repos.sites.list(actor, { cursor, limit: 200 }))
    .filter((site) => site.kind === 'estate');
}

export function listEstateWorkOrders(actor: Actor): WorkOrder[] {
  const sites = listEstateWorkOrderSites(actor);
  return allRows((cursor) => repos.workOrders.list(actor, { cursor, limit: 200 }))
    .filter((workOrder) => sites.some((site) => site.id === workOrder.siteId && site.tenantId === workOrder.tenantId));
}

export function listEstateWorkOrderUnits(actor: Actor): Unit[] {
  const sites = listEstateWorkOrderSites(actor);
  return allRows((cursor) => repos.units.list(actor, { cursor, limit: 200 }))
    .filter((unit) => sites.some((site) => site.id === unit.siteId && site.tenantId === unit.tenantId));
}

export function getEstateWorkOrder(actor: Actor, ref: string): WorkOrder | null {
  const workOrder = repos.workOrders.getByRef(actor, ref);
  if (!workOrder) return null;
  return listEstateWorkOrderSites(actor).some((site) => site.id === workOrder.siteId && site.tenantId === workOrder.tenantId)
    ? workOrder : null;
}
