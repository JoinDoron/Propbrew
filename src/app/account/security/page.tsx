import Link from 'next/link';
import { notFound,redirect } from 'next/navigation';
import { nativeAuthEnabled } from '@/server/auth/mode';
import { getNativeIdentity } from '@/server/auth/company';
import { AccountSecurityPanel } from '@/components/auth/account-security-panel';
import { isDemoAccount } from '@/server/auth/demo-config';
export const dynamic = 'force-dynamic';
export default async function AccountSecurityPage() {
  if(!nativeAuthEnabled())notFound(); const identity=await getNativeIdentity();if(!identity)redirect('/login');
  if(isDemoAccount(identity.user.id)) return <main className="pb-app min-h-screen bg-app p-5 md:p-8"><Link href="/workspaces" className="pb-link">← Demo workspaces</Link><section className="mt-8 max-w-xl"><h1 className="text-2xl font-semibold">Demo account security</h1><p className="mt-3 text-text-2">You can add and edit records in your private sandbox across all four modules. The shared sign-in credential and authenticator settings stay protected. Sign out and create your own Propbrew account to manage a real company and its team.</p></section></main>;
  return <main className="pb-app min-h-screen bg-app p-5 md:p-8"><Link href="/companies" className="pb-link">← Companies</Link><AccountSecurityPanel twoFactorEnabled={identity.user.twoFactorEnabled===true} email={identity.user.email}/></main>;
}
