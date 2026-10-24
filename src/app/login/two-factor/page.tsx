import { notFound } from 'next/navigation';
import { nativeAuthEnabled } from '@/server/auth/mode';
import { TwoFactorForm } from '@/components/auth/two-factor-form';
import { verifySecondFactor } from '@/server/actions/company-auth';
export const dynamic = 'force-dynamic';
export default async function SecondFactorPage({searchParams}:{searchParams?:Promise<{invite?:string}>}) {
  if (!nativeAuthEnabled()) notFound();
  const raw=(await searchParams)?.invite;const invite=typeof raw==='string'&&/^[A-Za-z0-9_-]{43}$/.test(raw)?raw:undefined;
  return <TwoFactorForm action={verifySecondFactor} invitationToken={invite} />;
}
