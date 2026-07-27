'use server';

/**
 * Session actions. In dev, "sign in" picks one of the identity presets; in
 * production this is replaced by the real credential exchange. Both refuse
 * nothing here — the gate is that a signed-out session redirects to /login.
 */

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { DEV_IDENTITY_COOKIE, SIGNED_OUT_COOKIE } from '@/server/session';
import { identityByKey } from '@/server/identities';
import { homeRouteFor } from '@/config/shells';

export async function signOut(): Promise<void> {
  const store = await cookies();
  store.set(SIGNED_OUT_COOKIE, '1', { path: '/', sameSite: 'lax', maxAge: 60 * 60 * 24 * 30 });
  redirect('/login');
}

export async function signInAs(key: string): Promise<void> {
  const identity = identityByKey(key);
  const store = await cookies();
  store.set(DEV_IDENTITY_COOKIE, identity.key, { path: '/', sameSite: 'lax', maxAge: 60 * 60 * 24 * 30 });
  store.delete(SIGNED_OUT_COOKIE);
  redirect(homeRouteFor(identity.actor));
}
