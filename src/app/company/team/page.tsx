import Link from 'next/link';
import { notFound,redirect } from 'next/navigation';
import { nativeAuthEnabled } from '@/server/auth/mode';
import { getCompanyPrincipal,listCompanyMembers } from '@/server/auth/company';
import { canManageCompanyMembers } from '@/lib/auth/company-policy';
import { CompanyTeam } from '@/components/auth/company-team';
import { createCompanyInvite,updateCompanyMember,removeCompanyMember } from '@/server/actions/companies';
export const dynamic = 'force-dynamic';
export default async function CompanyTeamPage() {
  if(!nativeAuthEnabled())notFound(); const current=await getCompanyPrincipal();if(!current)redirect('/companies');
  if(!canManageCompanyMembers(current.actor))notFound();
  return <main className="pb-app min-h-screen bg-app p-5 md:p-8"><Link href="/workspaces" className="pb-link">← Workspaces</Link><CompanyTeam companyName={current.company.name} members={await listCompanyMembers(current)} canManage={true} createCompanyInvite={createCompanyInvite} updateCompanyMember={updateCompanyMember} removeCompanyMember={removeCompanyMember}/></main>;
}
