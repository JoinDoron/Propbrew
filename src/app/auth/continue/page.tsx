import { redirect } from 'next/navigation';
import { getOwnerIdentity } from '@/server/onboarding/identity';
import { getOwnerSetup } from '@/server/onboarding/repository';
import { getSession } from '@/server/session';
import { homeRouteFor } from '@/config/shells';
import { nativeAuthEnabled } from '@/server/auth/mode';

export const dynamic = 'force-dynamic';

/** The single post-auth landing; existing non-owner accounts keep their shell. */
export default async function ContinueAfterAuthPage() {
  if (nativeAuthEnabled()) redirect('/companies');
  const owner = await getOwnerIdentity();
  if (owner) {
    const setup = await getOwnerSetup(owner.subject);
    if (!setup.completedAt && (owner.onboardingRequired || setup.version > 0)) redirect('/onboarding');
    redirect(owner.hasWorkspace ? owner.homeRoute : '/onboarding/complete');
  }
  const session = await getSession();
  if (!session) redirect('/login?account=unavailable');
  redirect(homeRouteFor(session.actor));
}
