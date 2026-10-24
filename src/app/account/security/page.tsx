import Link from 'next/link';
import { notFound,redirect } from 'next/navigation';
import { nativeAuthEnabled } from '@/server/auth/mode';
import { getNativeIdentity } from '@/server/auth/company';
import { AccountSecurityPanel } from '@/components/auth/account-security-panel';
export const dynamic = 'force-dynamic';
export default async function AccountSecurityPage() {
  if(!nativeAuthEnabled())notFound(); const identity=await getNativeIdentity();if(!identity)redirect('/login');
  return <main className="pb-app min-h-screen bg-app p-5 md:p-8"><Link href="/companies" className="pb-link">← Companies</Link><AccountSecurityPanel twoFactorEnabled={identity.user.twoFactorEnabled===true} email={identity.user.email}/></main>;
}
