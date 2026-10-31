import 'server-only';
import type { Actor, Action } from '@/lib/authz';
import type { Project, RFI } from '@/domain/construction/types';
import { scopedConstructionProjectGet } from '@/server/data';

export function rfiManager(actor: Actor): boolean {
  const profile = actor.companyAccess?.operationalProfileId;
  return actor.companyAccess?.companyRole === 'owner' || actor.companyAccess?.companyRole === 'admin'
    || profile === 'project-manager' || profile === 'site-manager'
    || (!profile && actor.roles.includes('estate_manager'));
}

export function rfiPackageAllowed(actor: Actor, project: Project, packageId?: string): boolean {
  if (actor.companyAccess?.operationalProfileId === 'construction-field-worker') return false;
  if (packageId && !project.mobilisation?.workPackages.some((pack) => pack.id === packageId)) return false;
  const assigned = actor.constructionPackageIds;
  if (actor.companyAccess?.operationalProfileId === 'subcontractor' && !assigned?.length) return false;
  if (assigned === undefined) return true;
  if (!packageId) return false;
  const pack = project.mobilisation?.workPackages.find((item) => item.id === packageId);
  return assigned.includes(packageId) || Boolean(pack?.costCode && assigned.includes(`${project.id}:${pack.costCode}`));
}

export function rfiInScope(actor: Actor, rfi: RFI, action: Action = 'read'): boolean {
  if (rfi.tenantId !== actor.tenantId) return false;
  try {
    const project = scopedConstructionProjectGet(actor, rfi.projectId, action);
    return !!project && rfiPackageAllowed(actor, project, rfi.workPackageId);
  } catch { return false; }
}
