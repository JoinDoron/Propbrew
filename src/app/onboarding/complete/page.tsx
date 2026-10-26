import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowRight, Check, Building2, Users, LayoutGrid } from 'lucide-react';
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
  const companySetup = identity.mode === 'company';
  const activated = record.activatedProperty;
  if (companySetup && !activated) throw new Error('The completed company setup is missing its activated property.');

  return (
    <main className={styles.page}>
      <div className={styles.completion}>
        <Link href="/" className={styles.logo}><PropbrewMark />propbrew</Link>
        <section className={styles.content} aria-labelledby="complete-title">
          <div className={styles.successIcon}><Check size={25} aria-hidden="true" /></div>
          <span className={styles.tag}>7 of 7 steps complete</span>
          <h1 id="complete-title" className={styles.title} style={{ marginTop: 16 }}>{companySetup ? 'Your first property is ready.' : 'Your portfolio setup is saved.'}</h1>
          <p className={styles.description}>{companySetup ? `${identity.companyName ? `${identity.companyName} is ready to get started. ` : ''}Your first property and its vacant units are saved in your company workspace.` : `Your first property and portfolio profile are ready for workspace activation. Your suggested fit is Propbrew ${plan.name}.`}</p>
          <div className={styles.plan}>
            <span className={styles.tag}><Building2 size={12} aria-hidden="true" />{companySetup ? 'Property created' : 'First property prepared'}</span>
            <h2 style={{ fontSize: 26 }}>{activated?.name ?? draft.firstProperty.name}</h2>
            <p>{draft.firstProperty.address}</p><p>{draft.firstProperty.city}, {draft.firstProperty.state} · {draft.firstProperty.country}</p>
            <p style={{ marginTop: 12 }}>{activated?.unitCount ?? draft.firstProperty.units} unit{(activated?.unitCount ?? draft.firstProperty.units) === 1 ? '' : 's'}{companySetup ? ' ready for residents' : ''} · {PORTFOLIO_OPTIONS.find((option) => option.key === draft.portfolioType)?.label}</p>
          </div>
          {draft.rentPaymentMethods.length > 0 && <div className={styles.summary}><h3>Rent payment methods</h3><p>{RENT_PAYMENT_METHODS.filter((option) => draft.rentPaymentMethods.includes(option.key)).map((option) => option.label).join(' · ')}</p></div>}
          <h2 className={styles.reasonTitle}>What happens next</h2>
          {companySetup ? <>
            <ul className={styles.features}>
              <li><Check size={15} aria-hidden="true" />Open the Estate overview to see your property and unit inventory.</li>
              <li><Check size={15} aria-hidden="true" />Add your first tenant and assign them to a vacant unit.</li>
              <li><Check size={15} aria-hidden="true" />Explore Facility, Shortlet and Construction from the workspace chooser.</li>
            </ul>
            <div className={styles.summary}><h3>Your suggested fit · Propbrew {plan.name}</h3><p>Your portfolio answers are saved. This recommendation does not start a subscription, payment or trial.</p></div>
            <div className={styles.actions}>
              <Link href="/estate" className={styles.primary}>Open Estate overview<ArrowRight size={14} aria-hidden="true" /></Link>
              <Link href="/people" className={styles.secondary}><Users size={14} aria-hidden="true" />Add your first tenant</Link>
              <Link href="/properties" className={styles.secondary}><Building2 size={14} aria-hidden="true" />View properties</Link>
              <Link href="/workspaces" className={styles.secondary}><LayoutGrid size={14} aria-hidden="true" />Explore all workspaces</Link>
            </div>
          </> : <>
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
          </>}
        </section>
      </div>
    </main>
  );
}
