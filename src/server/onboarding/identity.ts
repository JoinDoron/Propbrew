import 'server-only';

import { getSession } from '@/server/session';
import { homeRouteFor } from '@/config/shells';

export type OwnerIdentity = {
  subject: string;
  mode: 'local' | 'clerk';
  hasWorkspace: boolean;
  onboardingRequired: boolean;
  homeRoute: string;
};

export function clerkConfigured(): boolean {
  return Boolean(process.env.CLERK_SECRET_KEY && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
}

/** A setup identity is NOT an Actor: creating a draft grants no tenant access. */
export async function getOwnerIdentity(): Promise<OwnerIdentity | null> {
  if (clerkConfigured()) {
    const { auth } = await import('@clerk/nextjs/server');
    const session = await auth();
    if (!session.userId) return null;
    const claims = (session.sessionClaims ?? {}) as Record<string, unknown>;
    const metadata = (claims.metadata ?? claims.publicMetadata ?? {}) as Record<string, unknown>;
    const roles = Array.isArray(metadata.roles) ? metadata.roles : [];
    if (roles.includes('platform_admin')) return null;
    const owner = roles.includes('executive') || roles.includes('estate_manager');
    const assigned = typeof metadata.tenantId === 'string' && metadata.tenantId.length > 0;
    // Invited residents/vendors and platform admins must not enter owner setup.
    if (!owner && (assigned || roles.length > 0)) return null;
    const amr = Array.isArray(claims.amr) ? claims.amr.map(String) : [];
    if (process.env.REEVE_REQUIRE_MFA === '1' && !amr.some((method) => method.includes('mfa') || method === 'aal2')) return null;
    return { subject: session.userId, mode: 'clerk', hasWorkspace: assigned, onboardingRequired: !assigned || metadata.ownerOnboardingRequired === true, homeRoute: '/workspaces' };
  }

  // Never use development presets as a substitute for production registration.
  if (process.env.NODE_ENV === 'production') return null;
  const session = await getSession();
  if (!session || !session.actor.roles.some((role) => role === 'executive' || role === 'estate_manager')) return null;
  return {
    subject: `demo:${session.actor.tenantId}:${session.actor.userId}`,
    mode: 'local',
    hasWorkspace: true,
    onboardingRequired: false,
    homeRoute: homeRouteFor(session.actor),
  };
}
