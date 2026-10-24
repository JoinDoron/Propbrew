import Link from 'next/link';
import { notFound,redirect } from 'next/navigation';
import { nativeAuthEnabled } from '@/server/auth/mode';
import { getNativeIdentity } from '@/server/auth/company';
import { AccountSecurityPanel } from '@/components/auth/account-security-panel';
import { isDemoAccount } from '@/server/auth/demo-config';
export const dynamic = 'force-dynamic';
export default async function AccountSecurityPage() {
  if(!nativeAuthEnabled())notFound(); const identity=await getNativeIdentity();if(!identity)redirect('/login');
  if(isDemoAccount(identity.user.id)) return <main className="pb-app min-h-screen bg-app p-5 md:p-8"><Link href="/workspaces" className="pb-link">← Demo workspaces</Link><section className="mt-8 max-w-xl"><h1 className="text-2xl font-semibold">Demo account</h1><p className="mt-3 text-text-2">This shared sample account is view-only. Its password, authenticator settings and other visitors’ sessions cannot be changed. Sign out and create your own Propbrew account to manage company records and security.</p></section></main>;
  return <main className="pb-app min-h-screen bg-app p-5 md:p-8"><Link href="/companies" className="pb-link">← Companies</Link><AccountSecurityPanel twoFactorEnabled={identity.user.twoFactorEnabled===true} email={identity.user.email}/></main>;
}
