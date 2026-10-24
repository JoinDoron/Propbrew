import 'server-only';

import type { WorkOrder } from '@/domain/entities';
import { NOW_MS } from '@/domain/ppm';
import { db } from '@/server/data/store';
import { vendors } from '@/server/data/seed/fixtures';

/** Reject rolled-over dates such as 31 February as well as unparsable input. */
export function isFacilityDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const at = Date.parse(value);
  return Number.isFinite(at) && new Date(at).toISOString().slice(0, 10) === value;
}

type Assignment = Pick<WorkOrder, 'assigneeName' | 'assigneeUserId' | 'vendorOrgId'>;

/** Keep assignment choices and server writes on the same tenant/site rules. */
export function facilityAssignees(tenantId: string | null, siteId: string): Assignment[] {
  if (!tenantId) return [];
  return [
    ...db.users.filter((user) => user.tenantId === tenantId && user.status === 'active'
      && user.roles.includes('technician') && (user.allEstates || user.estateIds.some((id) => String(id) === String(siteId))))
      .map((user) => ({ assigneeName: user.name, assigneeUserId: user.id, vendorOrgId: undefined })),
    ...vendors.filter((vendor) => vendor.tenantId === tenantId && ['valid', 'expiring'].includes(vendor.compliance)
      && isFacilityDate(vendor.insuranceExpiry) && Date.parse(vendor.insuranceExpiry) >= NOW_MS)
      .map((vendor) => ({ assigneeName: vendor.name, assigneeUserId: undefined, vendorOrgId: vendor.id })),
  ];
}
