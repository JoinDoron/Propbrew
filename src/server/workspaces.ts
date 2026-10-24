import 'server-only';

import { cache } from 'react';
import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/server/session';
import { shellFor, homeRouteFor } from '@/config/shells';
import { canEnterWorkspace, type WorkspaceId } from '@/config/workspaces';
import { getOwnerIdentity } from '@/server/onboarding/identity';
import { getOwnerSetup } from '@/server/onboarding/repository';
import { nativeAuthEnabled } from './auth/mode';
import { getNativeIdentity } from './auth/company';

/** Module choice never supplies or changes an Actor, role, tenant, or scope. */
export const requireOperatorSession = cache(async () => {
  const session = await getSession();
  if (!session) {
    if (nativeAuthEnabled() && await getNativeIdentity()) redirect('/companies');
    if (await getOwnerIdentity()) redirect('/onboarding');
    redirect('/login');
  }
  if (shellFor(session.actor) !== 'ops') redirect(homeRouteFor(session.actor));

  if (session.key === 'clerk' && session.actor.roles.some((role) => role === 'executive' || role === 'estate_manager')) {
    const owner = await getOwnerIdentity();
    if (owner) {
      const setup = await getOwnerSetup(owner.subject);
      if (!setup.completedAt && (owner.onboardingRequired || setup.version > 0)) redirect('/onboarding');
    }
  }
  return session;
});

/** Server-side portal gate; existing per-page and mutation checks still apply. */
export async function requireWorkspace(workspace: WorkspaceId) {
  const session = await requireOperatorSession();
  if (!canEnterWorkspace(session.actor, workspace)) notFound();
  // Limit page affordances to this module. Membership authority remains the full
  // server-loaded record, and action wrappers independently check the module.
  if (session.actor.companyAccess) return { ...session, actor: { ...session.actor, companyAccess: { ...session.actor.companyAccess, modules: { [workspace]: session.actor.companyAccess.modules[workspace] } } } };
  return session;
}
