import 'server-only';
import { assertCan, matchesScope, type Action, type Actor, type Capability } from '@/lib/authz';
import { db } from '@/server/data/store';
import type { EstateTargetOption } from '@/domain/estate/targets';

/** Creation targets use the requested action's scope, never the first seed row. */
export function estateTargetOptions(actor: Actor, capability: Capability, action: Action = 'create'): EstateTargetOption[] {
  const scope = assertCan(actor, capability, action);
  return db.sites.filter((site) => site.kind === 'estate' && matchesScope({ ...site, siteId: site.id }, scope))
    .map((site) => ({ id: String(site.id), label: site.name }));
}
