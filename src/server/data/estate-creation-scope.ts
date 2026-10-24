import 'server-only';

import { can, type Actor } from '@/lib/authz';
import { canEnterWorkspace } from '@/config/workspaces';
import { db } from './store';

/** Registration narrows an existing grant; it never introduces a new role. */
export function canRegisterEstateRecords(actor: Actor): boolean {
  return Boolean(actor.tenantId?.trim()) && actor.roles.includes('estate_manager')
    && canEnterWorkspace(actor, 'estate') && can(actor, 'users_roles', 'create').allowed;
}

/**
 * Only the local demo-session boundary calls this function. Creator access is
 * verified against both a server-created receipt and the matching stored Site;
 * neither a request body nor a cookie may supply an estate assignment.
 */
export function withCreatedEstateAssignments(actor: Actor): Actor {
  const result: Actor = { ...actor, estateIds: [...actor.estateIds] };
  if (process.env.NODE_ENV === 'production' || process.env.DATA_SOURCE === 'http' || !canRegisterEstateRecords(actor)) return result;
  const assigned = db.estateCreatorAssignments.filter((assignment) =>
    assignment.tenantId === actor.tenantId && assignment.userId === actor.userId
    && assignment.source === 'estate_property_registration'
    && db.sites.some((site) => site.id === assignment.siteId && site.tenantId === actor.tenantId && site.kind === 'estate')
    && db.estateRegistrationReceipts.some((receipt) => receipt.kind === 'property'
      && receipt.tenantId === actor.tenantId && receipt.actorId === actor.userId && receipt.result.id === assignment.siteId));
  return { ...result, estateIds: Array.from(new Set([...actor.estateIds, ...assigned.map((assignment) => assignment.siteId)])) };
}
