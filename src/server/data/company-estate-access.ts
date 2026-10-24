import type { Actor } from '@/lib/authz';
import { canUseCompanyModule } from '@/lib/auth/company-policy';
import { nativeAuthEnabled } from '@/server/auth/mode';
import { reviewModeEnabled } from '@/server/review-auth';
import { currentRecordContext } from './record-context';
import { canRegisterEstateRecords } from './estate-creation-scope';

/** Actor must come from the authenticated server session, never form fields. */
export function nativeEstateCreationReady(actor: Actor, mode: 'read' | 'write' = 'read'): boolean {
  const context = currentRecordContext();
  return nativeAuthEnabled() && !reviewModeEnabled() && process.env.DATA_SOURCE === 'postgres'
    && Boolean(actor.companyAccess) && Boolean(actor.tenantId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(actor.tenantId))
    && context?.domainTenantId === actor.tenantId && (mode !== 'write' || context?.mode === 'write')
    && canUseCompanyModule(actor, 'estate', 'create') && canRegisterEstateRecords(actor);
}
