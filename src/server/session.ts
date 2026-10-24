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
import { assertReviewReadiness, getReviewSession, reviewModeEnabled } from './review-auth';
import { nativeAuthEnabled } from './auth/mode';
import { assertNativeAuthReadiness } from './auth/auth';
import { getCompanyPrincipal, getNativeIdentity } from './auth/company';
import { currentRecordContext } from './data/record-context';

export const DEV_IDENTITY_COOKIE = 'vesta_dev_identity';
export const SIGNED_OUT_COOKIE = 'vesta_signed_out';

/** Prevent an accidental production launch with the reset-on-restart demo store. */
export function assertProductionReadiness(): void {
  if (nativeAuthEnabled()) { assertNativeAuthReadiness(); return; }
  if (reviewModeEnabled()) { assertReviewReadiness(); return; }
  if (process.env.NODE_ENV === 'production' && process.env.NEXT_PHASE !== 'phase-production-build' && process.env.REEVE_ALLOW_IN_MEMORY_DATA !== '1' && process.env.DATA_SOURCE !== 'http') {
    throw new Error('Durable DATA_SOURCE is required in production. Set DATA_SOURCE=http after configuring the database adapter.');
  }
}

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
  if (nativeAuthEnabled()) return false;
  if (reviewModeEnabled()) return false;
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
  assertProductionReadiness();
  if (nativeAuthEnabled()) {
    const principal = currentRecordContext()?.companyPrincipal ?? await getCompanyPrincipal();
    if (!principal) return null;
    return { key: 'company', label: principal.user.name, roleSummary: principal.membership.companyRole === 'member' ? 'Team member' : principal.membership.companyRole === 'owner' ? 'Company owner' : 'Company administrator', tenantLabel: principal.company.name, actor: principal.actor };
  }
  if (reviewModeEnabled()) return getReviewSession();
  const store = await cookies();

  // Real production session path. Clerk enforces passwordless/social login,
  // MFA policy, token expiry and revocation; authorization metadata is copied
  // into our stable Actor shape so DAL scope rules remain unchanged.
  if (process.env.CLERK_SECRET_KEY && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    const { auth } = await import('@clerk/nextjs/server');
    const session = await auth();
    if (!session.userId) return null;
    const claims = (session.sessionClaims ?? {}) as Record<string, unknown>;
    const metadata = (claims.metadata ?? claims.publicMetadata ?? {}) as Record<string, unknown>;
    const amr = Array.isArray(claims.amr) ? claims.amr.map(String) : [];
    if (process.env.REEVE_REQUIRE_MFA === '1' && !amr.some((method) => method.includes('mfa') || method === 'aal2')) return null;
    const roles = (Array.isArray(metadata.roles) ? metadata.roles : ['resident']).filter((role): role is Actor['roles'][number] => typeof role === 'string') as Actor['roles'];
    const actor: Actor = {
      userId: session.userId,
      tenantId: typeof metadata.tenantId === 'string' ? metadata.tenantId : null,
      roles,
      estateIds: Array.isArray(metadata.estateIds) ? metadata.estateIds.filter((x): x is string => typeof x === 'string') : [],
      allEstates: metadata.allEstates === true,
      unitIds: Array.isArray(metadata.unitIds) ? metadata.unitIds.filter((x): x is string => typeof x === 'string') : [],
      vendorOrgId: typeof metadata.vendorOrgId === 'string' ? metadata.vendorOrgId : null,
      investorProjectIds: Array.isArray(metadata.investorProjectIds) ? metadata.investorProjectIds.filter((x): x is string => typeof x === 'string') : [],
    };
    if (!actor.tenantId && !actor.roles.includes('platform_admin')) return null;
    return { key: 'clerk', label: String(claims.name ?? session.userId), roleSummary: roles.join(' · '), tenantLabel: actor.tenantId ?? 'Platform', actor };
  }

  // SECURITY: the identity cookie is unsigned, so it is only trustworthy while
  // the dev switcher is explicitly enabled. Without that flag a forged
  // `vesta_dev_identity=platform_admin` header would be a full impersonation
  // endpoint, and a cookie-less visitor would be silently signed in as the
  // demo default. Off by default => no session => getActor() bounces to /login.
  if (!devIdentityEnabled()) return null;
  if (store.get(SIGNED_OUT_COOKIE)?.value === '1') return null;

  const key = store.get(DEV_IDENTITY_COOKIE)?.value ?? DEFAULT_IDENTITY_KEY;
  const identity = identityByKey(key);
  // Demo registration can assign only a property this same user just created.
  // Real Clerk claims and production scopes are never augmented from memory.
  if (process.env.NODE_ENV === 'production' || process.env.DATA_SOURCE === 'http') return identity;
  const { withCreatedEstateAssignments } = await import('./data/estate-creation-scope');
  return { ...identity, actor: withCreatedEstateAssignments(identity.actor) };
}

/** The current dev identity (cookie → preset), ignoring sign-out. Dev switcher only. */
export async function getDevIdentity(): Promise<DevIdentity> {
  if (reviewModeEnabled()) {
    const session = await getReviewSession();
    if (!session) redirect('/review/login');
    return session;
  }
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
  if (!session) {
    if (nativeAuthEnabled() && await getNativeIdentity()) redirect('/companies');
    if (reviewModeEnabled()) redirect('/review/login');
    // New verified owners have no tenant Actor until activation. They may only
    // reach their self-owned onboarding record, never a seeded tenant.
    const { getOwnerIdentity } = await import('./onboarding/identity');
    if (await getOwnerIdentity()) redirect('/onboarding');
    redirect('/login');
  }
  return session.actor;
}

export { DEV_IDENTITIES };
