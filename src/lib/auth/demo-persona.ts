import type { Actor } from '@/lib/authz';
import type { DemoPersona } from '@/config/demo-personas';

/** Apply an allowlisted persona only after the caller verifies a demo account. */
export function projectDemoSandboxActor(actor: Actor, persona: DemoPersona): Actor {
  if (!actor.companyAccess) throw new Error('A company-scoped demo actor is required.');
  return Object.freeze({
    ...actor,
    roles: Object.freeze([...persona.roles]),
    estateIds: persona.estateIds ? Object.freeze([...persona.estateIds]) : actor.estateIds,
    buildingIds: persona.buildingIds ? Object.freeze([...persona.buildingIds]) : actor.buildingIds,
    allEstates: persona.allEstates ?? actor.allEstates,
    unitIds: persona.unitIds ? Object.freeze([...persona.unitIds]) : actor.unitIds,
    vendorOrgId: persona.vendorOrgId ?? actor.vendorOrgId,
    companyAccess: Object.freeze({
      ...actor.companyAccess,
      modules: Object.freeze({ ...persona.modules }),
      ...(persona.capabilities ? { capabilities: Object.freeze({ ...persona.capabilities }) } : {}),
      ...(persona.capabilityActions ? { capabilityActions: Object.freeze({ ...persona.capabilityActions }) } : {}),
    }),
  });
}
