import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { SignUp } from '@clerk/nextjs';
import { ArrowRight } from 'lucide-react';
import { PropbrewMark } from '@/components/brand/propbrew-logo';
import { clerkConfigured, getOwnerIdentity } from '@/server/onboarding/identity';
import { devIdentityEnabled } from '@/server/session';
import styles from '@/components/onboarding/owner-setup.module.css';
import { nativeAuthEnabled } from '@/server/auth/mode';
import { getNativeIdentity } from '@/server/auth/company';
import { AccountForm } from '@/components/auth/account-form';
import { registerAccount } from '@/server/actions/company-auth';

export const metadata: Metadata = { title: 'Create your owner account · Propbrew', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function OwnerSignUpPage({searchParams}:{searchParams:Promise<{invite?:string}>}) {
  if (nativeAuthEnabled()) {
    const raw=(await searchParams)?.invite;const invite=typeof raw==='string'&&/^[A-Za-z0-9_-]{43}$/.test(raw)?raw:undefined;
    if (await getNativeIdentity()) redirect(invite?`/invite/${invite}`:'/companies');
    return <AccountForm mode="signup" action={registerAccount} invitationToken={invite} />;
  }
  const configured = clerkConfigured();
  const identity = configured ? await getOwnerIdentity() : null;
  if (identity) redirect('/auth/continue');
  if (configured) {
    const { auth } = await import('@clerk/nextjs/server');
    if ((await auth()).userId) redirect('/login');
  }
  const preview = !configured && process.env.NODE_ENV !== 'production' && devIdentityEnabled();

  return (
    <main className={`${styles.page} ${styles.auth}`}>
      <div className={styles.authCard}>
        <Link href="/" className={styles.logo} aria-label="Propbrew home"><PropbrewMark />propbrew</Link>
        <h1>A clearer view of your property starts here.</h1>
        <p>Create your owner account, then tell us about your portfolio. We’ll help you prepare your first property and find a sensible starting point.</p>
        {configured ? (
          <div className={styles.authWidget}>
            <SignUp routing="path" path="/sign-up" signInUrl="/login" forceRedirectUrl="/onboarding" signInForceRedirectUrl="/auth/continue" />
          </div>
        ) : preview ? (
          <>
            <p className={styles.notice}>Local development preview. Registration is not connected here. Continue with an existing owner demo account to try portfolio setup.</p>
            <Link className={styles.primary} href="/onboarding">Preview owner setup<ArrowRight size={14} aria-hidden="true" /></Link>
          </>
        ) : (
          <p className={styles.notice}>Owner registration is not available in this environment yet. Please contact your Propbrew administrator for account access.</p>
        )}
        <p style={{ marginBottom: 0, marginTop: 22 }}>Already have an account? <Link href="/login">Sign in</Link></p>
      </div>
    </main>
  );
}
