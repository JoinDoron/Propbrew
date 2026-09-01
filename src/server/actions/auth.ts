'use server';

/**
 * Session actions. In dev, "sign in" picks one of the identity presets; in
 * production this is replaced by the real credential exchange.
 *
 * SECURITY: `signInAs` takes an identity key and no credential, so it is an
 * impersonation endpoint by design. It is therefore hard-gated on the same dev
 * flag as the switcher — without it the action refuses rather than issuing a
 * session. Server actions are publicly callable, so this gate must live here
 * and not only in the UI that renders the buttons.
 */

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { DEV_IDENTITY_COOKIE, SIGNED_OUT_COOKIE, devIdentityEnabled } from '@/server/session';
import { identityByKey } from '@/server/identities';
import { homeRouteFor } from '@/config/shells';

export async function signOut(): Promise<void> {
  const store = await cookies();
  store.set(SIGNED_OUT_COOKIE, '1', { path: '/', httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 60 * 60 * 24 * 30 });
  redirect('/login');
}

export async function signInAs(key: string): Promise<void> {
  if (!devIdentityEnabled()) {
    throw new Error('Credential sign-in is not configured. The demo identity picker is disabled.');
  }
  const identity = identityByKey(key);
  const store = await cookies();
  store.set(DEV_IDENTITY_COOKIE, identity.key, { path: '/', httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 60 * 60 * 24 * 30 });
  store.delete(SIGNED_OUT_COOKIE);
  redirect(homeRouteFor(identity.actor));
}
