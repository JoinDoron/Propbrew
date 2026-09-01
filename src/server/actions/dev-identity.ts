'use server';

/**
 * Dev-only server action: switch the acting identity. Sets the cookie
 * `getActor()` reads and redirects to the new identity's home. Refuses to run
 * unless the switcher is enabled, so it can never be a production auth bypass.
 */

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { DEV_IDENTITY_COOKIE, devIdentityEnabled } from '@/server/session';
import { identityByKey } from '@/server/identities';
import { homeRouteFor } from '@/config/shells';

export async function switchIdentity(key: string): Promise<void> {
  if (!devIdentityEnabled()) return;
  const identity = identityByKey(key);
  const store = await cookies();
  store.set(DEV_IDENTITY_COOKIE, identity.key, {
    // httpOnly so an XSS cannot read or forge the identity cookie.
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  redirect(homeRouteFor(identity.actor));
}
