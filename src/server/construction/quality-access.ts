import 'server-only';
import type { Actor, Action } from '@/lib/authz';
import type { Issue } from '@/domain/construction/types';
import { scopedConstructionProjectGet } from '@/server/data';
import { rfiPackageAllowed } from './rfi-access';

/** Quality records inherit both the assigned project and work-package boundary. */
export function qualityIssueVisible(actor: Actor, issue: Issue, action: Action = 'read'): boolean {
  if (issue.tenantId !== actor.tenantId) return false;
  try {
    const project = scopedConstructionProjectGet(actor, issue.projectId, action);
    return Boolean(project && rfiPackageAllowed(actor, project, issue.workPackageId));
  } catch { return false; }
}

/** A signed closeout is a manager, quality inspector or consultant decision. */
export function canRecordQualitySignOff(actor: Actor): boolean {
  const profile = actor.companyAccess?.operationalProfileId;
  return actor.companyAccess?.companyRole === 'owner' || actor.companyAccess?.companyRole === 'admin'
    || profile === 'project-manager' || profile === 'site-manager' || profile === 'quality-inspector' || profile === 'consultant-approver'
    || !profile && actor.roles.includes('estate_manager');
}
