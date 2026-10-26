import type { Actor } from '@/lib/authz';
import type { DemoPersona } from '@/config/demo-personas';

/** Apply an allowlisted persona only after the caller verifies a demo account. */
export function projectDemoSandboxActor(actor: Actor, persona: DemoPersona): Actor {
  if (!actor.companyAccess) throw new Error('A company-scoped demo actor is required.');
  return Object.freeze({
    ...actor,
    roles: Object.freeze([...persona.roles]),
    companyAccess: Object.freeze({
      ...actor.companyAccess,
      modules: Object.freeze({ ...persona.modules }),
    }),
  });
}
