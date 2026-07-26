import 'server-only';

/**
 * The session boundary. `getActor()` is the ONE place the rest of the app learns
 * who is asking — today from a dev cookie, tomorrow from the real session. Every
 * repository and server action derives its ScopeFilter from this actor and never
 * from a request body or URL segment (§8.2).
 */

import { cookies } from 'next/headers';
import type { Actor } from '@/lib/authz';
import { DEFAULT_IDENTITY_KEY, DEV_IDENTITIES, identityByKey, type DevIdentity } from './identities';

export const DEV_IDENTITY_COOKIE = 'vesta_dev_identity';

/** Is the dev identity switcher enabled? Never true in a production build. */
export function devIdentityEnabled(): boolean {
  return process.env.NEXT_PUBLIC_DEV_IDENTITY === '1';
}

/** The current dev identity (cookie → preset). Dev-only. */
export async function getDevIdentity(): Promise<DevIdentity> {
  const store = await cookies();
  const key = store.get(DEV_IDENTITY_COOKIE)?.value ?? DEFAULT_IDENTITY_KEY;
  return identityByKey(key);
}

/**
 * The authenticated actor. In dev this reads the identity switcher; in
 * production this is where real session decoding goes — the return type never
 * changes, so nothing downstream is touched by the swap.
 */
export async function getActor(): Promise<Actor> {
  if (devIdentityEnabled()) {
    return (await getDevIdentity()).actor;
  }
  // Production path (not yet wired): decode the real session here.
  // Until auth (SC-01) lands we fall back to the default preset so the app is
  // navigable; this branch must be replaced before any real deployment.
  return identityByKey(DEFAULT_IDENTITY_KEY).actor;
}

export { DEV_IDENTITIES };
