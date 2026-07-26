import 'server-only';

/**
 * Per-page authorization. `requireCapability` is the guard a page opens with:
 * it derives the actor, asserts the §7 capability, and on denial calls
 * `notFound()` — never a descriptive 403, so route existence cannot be
 * enumerated (a 403 naming the capability leaks which capabilities exist).
 *
 * This is the CLIENT-side gate. SC-01: the real boundary is the API, which must
 * repeat every check independently.
 */

import { notFound } from 'next/navigation';
import { ForbiddenError, assertCan, type Action, type Actor, type Capability, type ScopeFilter } from '@/lib/authz';
import { getActor } from './session';

export async function requireCapability(
  capability: Capability,
  action: Action = 'read',
): Promise<{ actor: Actor; scope: ScopeFilter }> {
  const actor = await getActor();
  try {
    const scope = assertCan(actor, capability, action);
    return { actor, scope };
  } catch (e) {
    if (e instanceof ForbiddenError) notFound();
    throw e;
  }
}

export { getActor };
