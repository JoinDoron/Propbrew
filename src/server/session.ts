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

/**
 * Is the demo identity switcher enabled?
 *
 * SECURITY: `NEXT_PUBLIC_*` variables are INLINED AT BUILD TIME, so their value
 * is fixed by whatever environment compiled the bundle — a production build made
 * on a developer's machine would bake in `1` and ship the gate open. A build-time
 * constant therefore cannot be trusted to gate a security decision.
 *
 * In a production build the switcher is off unless a SERVER-ONLY variable, read
 * at runtime, explicitly turns it on. Deploying a public demo stays possible, but
 * only as a deliberate act by whoever controls the environment.
 */
export function devIdentityEnabled(): boolean {
  if (process.env.NODE_ENV !== 'production') {
    return process.env.NEXT_PUBLIC_DEV_IDENTITY === '1';
  }
  return process.env.REEVE_ALLOW_DEMO_IDENTITIES === '1';
}

/**
 * The current session, or null if the user has explicitly signed out. In
 * production this is where real session decoding goes — the return type never
 * changes, so nothing downstream is touched by the swap.
 */
export async function getSession(): Promise<DevIdentity | null> {
  const store = await cookies();
  if (store.get(SIGNED_OUT_COOKIE)?.value === '1') return null;

  // SECURITY: the identity cookie is unsigned, so it is only trustworthy while
  // the dev switcher is explicitly enabled. Without that flag a forged
  // `vesta_dev_identity=platform_admin` header would be a full impersonation
  // endpoint, and a cookie-less visitor would be silently signed in as the
  // demo default. Off by default => no session => getActor() bounces to /login.
  if (!devIdentityEnabled()) return null;

  const key = store.get(DEV_IDENTITY_COOKIE)?.value ?? DEFAULT_IDENTITY_KEY;
  return identityByKey(key);
}

/** The current dev identity (cookie → preset), ignoring sign-out. Dev switcher only. */
export async function getDevIdentity(): Promise<DevIdentity> {
  const store = await cookies();
  const key = devIdentityEnabled() ? store.get(DEV_IDENTITY_COOKIE)?.value : undefined;
  return identityByKey(key ?? DEFAULT_IDENTITY_KEY);
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
