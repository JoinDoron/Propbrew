import 'server-only';

import type { WorkOrder } from '@/domain/entities';
import { operatingDateISO } from '@/server/operating-clock';
import { db } from '@/server/data/store';
import type { Actor } from '@/lib/authz';
import { getCompanyPrincipal } from '@/server/auth/company';
import { withAuthTransaction } from '@/server/auth/database';

/** Reject rolled-over dates such as 31 February as well as unparsable input. */
export function isFacilityDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const at = Date.parse(value);
  return Number.isFinite(at) && new Date(at).toISOString().slice(0, 10) === value;
}

export type FacilityAssignment = Pick<WorkOrder, 'assigneeName' | 'assigneeUserId' | 'vendorOrgId'> & { key: string; kind: 'technician' | 'vendor' };

/** Keep assignment choices and server writes on the same tenant/site rules. */
export function facilityAssignees(tenantId: string | null, siteId: string): FacilityAssignment[] {
  if (!tenantId) return [];
  return [
    ...db.users.filter((user) => user.tenantId === tenantId && user.status === 'active'
      && user.roles.includes('technician') && (user.allEstates || user.estateIds.some((id) => String(id) === String(siteId))))
      .map((user) => ({ key: `user:${user.id}`, kind: 'technician' as const, assigneeName: user.name, assigneeUserId: user.id, vendorOrgId: undefined })),
    ...db.vendors.filter((vendor) => vendor.tenantId === tenantId && ['valid', 'expiring'].includes(vendor.compliance)
      && isFacilityDate(vendor.insuranceExpiry) && vendor.insuranceExpiry >= operatingDateISO())
      .map((vendor) => ({ key: `vendor:${vendor.id}`, kind: 'vendor' as const, assigneeName: vendor.name, assigneeUserId: undefined, vendorOrgId: vendor.id })),
  ];
}

/** Native technicians live in company membership, not the demo user fixture.
 * Read their current role and site scope from the authenticated company ledger. */
export async function facilityAssigneesFor(actor: Actor, siteId: string): Promise<FacilityAssignment[]> {
  const local = facilityAssignees(actor.tenantId, siteId);
  if (!actor.companyAccess || !actor.tenantId) return local;
  const principal = await getCompanyPrincipal();
  if (!principal || principal.company.id !== actor.tenantId || principal.user.id !== actor.userId) return local.filter((item) => item.kind === 'vendor');
  const technicians = await withAuthTransaction(principal.user.id, async (client) => (await client.query<{ user_id: string; name: string }>(
    `select m.user_id,u.name from company_memberships m join auth_users u on u.id=m.user_id
     where m.tenant_id=$1::uuid and m.status='active' and m.facility_role='technician'
       and m.modules->>'facility'='manage' and (m.all_estates or m.estate_ids ? $2)
     order by lower(u.name),m.user_id`, [actor.tenantId, siteId],
  )).rows, principal.session.id);
  const native = technicians.map((row) => ({ key: `user:${row.user_id}`, kind: 'technician', assigneeName: row.name, assigneeUserId: row.user_id, vendorOrgId: undefined }) as unknown as FacilityAssignment);
  return [...native, ...local.filter((item) => item.kind === 'vendor')];
}
