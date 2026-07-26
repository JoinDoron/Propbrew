/**
 * Which of the three authenticated shells an actor lands in, and where.
 *
 * SC-06 asks for two products in one codebase — a "responsive web app for
 * residents/managers" and a "platform admin console" — and the own-records-only
 * roles need a third information architecture again ("My requests", not a work-
 * order board). One nav filtered nine ways would collapse all three; separate
 * route groups keep an ops nav leak from ever exposing an admin route.
 */

import type { Actor } from '@/lib/authz';
import type { Role } from '@/domain/enums';

export type Shell = 'ops' | 'portal' | 'admin';

/** Roles that live in the ops console (managers + field staff). */
const OPS_ROLES: ReadonlySet<Role> = new Set<Role>([
  'executive',
  'estate_manager',
  'facility_manager',
  'technician',
  'security',
]);

export function shellFor(actor: Actor): Shell {
  if (actor.roles.includes('platform_admin')) return 'admin';
  if (actor.roles.some((r) => OPS_ROLES.has(r))) return 'ops';
  return 'portal'; // resident / vendor / investor only
}

/** Per-role landing route. A multi-role user lands via its strongest shell. */
export function homeRouteFor(actor: Actor): string {
  const shell = shellFor(actor);
  if (shell === 'admin') return '/admin/tenants';
  if (shell === 'portal') {
    if (actor.roles.includes('vendor')) return '/portal/jobs';
    if (actor.roles.includes('investor')) return '/portal/projects';
    return '/portal';
  }
  // ops
  if (actor.roles.includes('technician') && !actor.roles.includes('facility_manager')) {
    return '/work-orders';
  }
  if (actor.roles.includes('security') && actor.roles.every((r) => r === 'security')) {
    return '/security';
  }
  return '/dashboard';
}
