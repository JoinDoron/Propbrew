import 'server-only';

/**
 * The session boundary. `getSession()` / `getActor()` are the ONE place the rest
 * of the app learns who is asking — today from a dev cookie, tomorrow from the
 * real session. Every repository and server action derives its ScopeFilter from
 * this actor and never from a request body or URL segment (§8.2).
 *
 * Sign-out is modelled with an explicit `vesta_signed_out` marker so a fresh
 * visit still auto-signs-in the demo default, but an explicit sign-out really
 * ends the session and bounces to /login.
 */

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Actor } from '@/lib/authz';
import { DEFAULT_IDENTITY_KEY, DEV_IDENTITIES, identityByKey, type DevIdentity } from './identities';

export const DEV_IDENTITY_COOKIE = 'vesta_dev_identity';
export const SIGNED_OUT_COOKIE = 'vesta_signed_out';

/** Is the dev identity switcher enabled? Never true in a production build. */
export function devIdentityEnabled(): boolean {
  return process.env.NEXT_PUBLIC_DEV_IDENTITY === '1';
}

/**
 * The current session, or null if the user has explicitly signed out. In
 * production this is where real session decoding goes — the return type never
 * changes, so nothing downstream is touched by the swap.
 */
export async function getSession(): Promise<DevIdentity | null> {
  const store = await cookies();
  if (store.get(SIGNED_OUT_COOKIE)?.value === '1') return null;
  const key = store.get(DEV_IDENTITY_COOKIE)?.value ?? DEFAULT_IDENTITY_KEY;
  return identityByKey(key);
}

/** The current dev identity (cookie → preset), ignoring sign-out. Dev switcher only. */
export async function getDevIdentity(): Promise<DevIdentity> {
  const store = await cookies();
  const key = store.get(DEV_IDENTITY_COOKIE)?.value ?? DEFAULT_IDENTITY_KEY;
  return identityByKey(key);
}

/**
 * The authenticated actor. Redirects to /login when there is no session, so
 * every page and action that needs an actor is implicitly gated.
 */
export async function getActor(): Promise<Actor> {
  const session = await getSession();
  if (!session) redirect('/login');
  return session.actor;
}

export { DEV_IDENTITIES };
