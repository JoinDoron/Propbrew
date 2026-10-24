import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowRight, Check, Building2 } from 'lucide-react';
import { PropbrewMark } from '@/components/brand/propbrew-logo';
import { getOwnerIdentity } from '@/server/onboarding/identity';
import { getOwnerSetup } from '@/server/onboarding/repository';
import { PORTFOLIO_OPTIONS, RENT_PAYMENT_METHODS, recommendOwnerPlan } from '@/domain/owner-onboarding';
import styles from '@/components/onboarding/owner-setup.module.css';

export const metadata: Metadata = { title: 'Portfolio setup saved · Propbrew', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function OwnerSetupCompletePage() {
  const identity = await getOwnerIdentity();
  if (!identity) redirect('/login');
  const record = await getOwnerSetup(identity.subject);
  if (!record.completedAt) redirect('/onboarding');
  const { draft } = record;
  const plan = recommendOwnerPlan(draft);

  return (
    <main className={styles.page}>
      <div className={styles.completion}>
        <Link href="/" className={styles.logo}><PropbrewMark />propbrew</Link>
        <section className={styles.content} aria-labelledby="complete-title">
          <div className={styles.successIcon}><Check size={25} aria-hidden="true" /></div>
          <span className={styles.tag}>7 of 7 steps complete</span>
          <h1 id="complete-title" className={styles.title} style={{ marginTop: 16 }}>Your portfolio setup is saved.</h1>
          <p className={styles.description}>Your first property and portfolio profile are ready for workspace activation. Your suggested fit is Propbrew {plan.name}.</p>
          <div className={styles.plan}>
            <span className={styles.tag}><Building2 size={12} aria-hidden="true" />First property prepared</span>
            <h2 style={{ fontSize: 26 }}>{draft.firstProperty.name}</h2>
            <p>{draft.firstProperty.address}</p><p>{draft.firstProperty.city}, {draft.firstProperty.state} · {draft.firstProperty.country}</p>
            <p style={{ marginTop: 12 }}>{draft.firstProperty.units} unit{draft.firstProperty.units === 1 ? '' : 's'} · {PORTFOLIO_OPTIONS.find((option) => option.key === draft.portfolioType)?.label}</p>
          </div>
          {draft.rentPaymentMethods.length > 0 && <div className={styles.summary}><h3>Rent payment methods</h3><p>{RENT_PAYMENT_METHODS.filter((option) => draft.rentPaymentMethods.includes(option.key)).map((option) => option.label).join(' · ')}</p></div>}
          <h2 className={styles.reasonTitle}>What happens next</h2>
          <ul className={styles.features}>
            <li><Check size={15} aria-hidden="true" />Your portfolio profile and first-property setup have been saved.</li>
            <li><Check size={15} aria-hidden="true" />Workspace access, pricing, and any trial must be confirmed before activation.</li>
            <li><Check size={15} aria-hidden="true" />No payment, tenant invitation, rent collection, or AI processing has been started.</li>
          </ul>
          <p className={styles.notice} style={{ marginTop: 24 }}>Activation pending · this property is a saved setup record, not yet an operational property in the management dashboard.{identity.mode === 'local' ? ' This preview is stored locally for your demo account.' : ''}</p>
          <div className={styles.actions}>
            {identity.hasWorkspace && <Link href={identity.homeRoute} className={styles.primary}>Open existing workspace<ArrowRight size={14} aria-hidden="true" /></Link>}
            <Link href="/" className={styles.back}>Back to Propbrew</Link>
          </div>
        </section>
      </div>
    </main>
  );
}
