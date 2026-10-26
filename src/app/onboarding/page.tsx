import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getOwnerIdentity } from '@/server/onboarding/identity';
import { getOwnerSetup } from '@/server/onboarding/repository';
import { OwnerSetupWizard } from '@/components/onboarding/owner-setup-wizard';

export const metadata: Metadata = { title: 'Set up your portfolio · Propbrew', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function OwnerOnboardingPage() {
  const identity = await getOwnerIdentity();
  if (!identity) redirect('/login');
  const record = await getOwnerSetup(identity.subject);
  if (record.completedAt) redirect('/onboarding/complete');
  return <OwnerSetupWizard initial={record} mode={identity.mode} homeRoute={identity.homeRoute} hasWorkspace={identity.hasWorkspace} companyName={identity.companyName} scope={identity.subject} />;
}
