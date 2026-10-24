import { redirect } from 'next/navigation';
import Link from 'next/link';
import { SignIn, UserButton } from '@clerk/nextjs';
import { Building2 } from 'lucide-react';
import { getSession, DEV_IDENTITIES, devIdentityEnabled } from '@/server/session';
import { clerkConfigured, getOwnerIdentity } from '@/server/onboarding/identity';
import { homeRouteFor } from '@/config/shells';
import { brand } from '@/config/brand';
import { SignInList } from '@/components/auth/sign-in-list';
import { reviewModeEnabled } from '@/server/review-auth';
import { nativeAuthEnabled } from '@/server/auth/mode';
import { getNativeIdentity } from '@/server/auth/company';
import { AccountForm } from '@/components/auth/account-form';
import { loginAccount } from '@/server/actions/company-auth';

/** The signed-out landing (SC-01 sign-in). Public — not gated. In dev it offers
 *  the identity presets as accounts; production swaps in the real credential UI. */
export default async function LoginPage({searchParams}:{searchParams:Promise<{invite?:string}>}) {
  if (nativeAuthEnabled()) {
    const raw=(await searchParams)?.invite;const invite=typeof raw==='string'&&/^[A-Za-z0-9_-]{43}$/.test(raw)?raw:undefined;
    if (await getNativeIdentity()) redirect(invite?`/invite/${invite}`:'/companies');
    return <AccountForm mode="login" action={loginAccount} invitationToken={invite} />;
  }
  if (reviewModeEnabled()) redirect('/review/login');
  const session = await getSession();
  const configured = clerkConfigured();
  if (session) redirect(configured ? '/auth/continue' : homeRouteFor(session.actor));
  let authenticatedWithoutAccess = false;
  if (configured) {
    if (await getOwnerIdentity()) redirect('/auth/continue');
    const { auth } = await import('@clerk/nextjs/server');
    authenticatedWithoutAccess = Boolean((await auth()).userId);
  }
  const demo = !configured && devIdentityEnabled();

  const accounts = DEV_IDENTITIES.map((i) => ({
    key: i.key,
    name: i.label.split(' — ')[1] ?? i.label,
    roleSummary: i.roleSummary,
    tenantLabel: i.tenantLabel,
  }));

  return (
    <div className="pb-app min-h-screen bg-app text-text flex items-center justify-center p-5">
      <div className="w-full max-w-[420px]">
        <div className="flex items-center gap-2.5 mb-6 justify-center">
          <span className="w-10 h-10 rounded-xl flex items-center justify-center text-white bg-primary" style={{ boxShadow: '0 6px 16px var(--primary-weak-2)' }}>
            <Building2 size={20} />
          </span>
          <div className="leading-none">
            <div className="font-bold text-[18px] tracking-[-0.02em]">{brand.name}</div>
            <div className="text-[10.5px] text-text-3 font-medium tracking-[0.04em] mt-1">{brand.tagline}</div>
          </div>
        </div>

        <div className="bg-surface border border-border rounded-2xl shadow-card p-5 sm:p-6">
          <h1 className="text-[24px] font-medium tracking-[-0.03em]">Sign in</h1>
          {configured ? authenticatedWithoutAccess ? (
            <div className="mt-4 text-[13px] text-text-2 leading-relaxed">
              <p>Your account is signed in, but its workspace access or required security checks are not ready. Contact your administrator, or sign out to use another account.</p>
              <div className="mt-4"><UserButton /></div>
            </div>
          ) : (
            <div className="mt-4"><SignIn routing="hash" signUpUrl="/sign-up" forceRedirectUrl="/auth/continue" signUpForceRedirectUrl="/onboarding" /></div>
          ) : demo ? (
            <>
              <p className="text-[13px] text-text-3 mt-1 mb-4">Choose a demo account to continue.</p>
              <SignInList accounts={accounts} />
            </>
          ) : <p className="text-[13px] text-text-2 mt-3">Sign-in is not configured in this environment. Please contact your administrator.</p>}
          <p className="text-[13px] text-text-2 mt-5">New property owner? <Link className="text-primary font-medium underline underline-offset-4" href="/sign-up">Set up your portfolio</Link></p>
        </div>

        <p className="text-center text-[11.5px] text-text-3 mt-4">
          {brand.name} · built for {brand.client}
        </p>
      </div>
    </div>
  );
}
