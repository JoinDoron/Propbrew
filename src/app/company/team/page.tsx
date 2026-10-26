import Link from 'next/link';
import { notFound,redirect } from 'next/navigation';
import { nativeAuthEnabled } from '@/server/auth/mode';
import { getCompanyPrincipal,listCompanyMembers } from '@/server/auth/company';
import { canManageCompanyMembers } from '@/lib/auth/company-policy';
import { CompanyTeam } from '@/components/auth/company-team';
import { createCompanyInvite,updateCompanyMember,removeCompanyMember } from '@/server/actions/companies';
import { withDurableRead } from '@/server/data/durable-records';
import { repos } from '@/server/data';
export const dynamic = 'force-dynamic';
export default async function CompanyTeamPage() {
  if(!nativeAuthEnabled())notFound(); const current=await getCompanyPrincipal();if(!current)redirect('/companies');
  if(!canManageCompanyMembers(current.actor))notFound();
  const vendors=await withDurableRead(async()=>repos.vendors.list(current.actor,{limit:200}).items.map((vendor)=>({id:String(vendor.id),name:vendor.name})));
  return <main className="pb-app min-h-screen bg-app p-5 md:p-8"><Link href="/workspaces" className="pb-link">← Workspaces</Link><CompanyTeam companyName={current.company.name} members={await listCompanyMembers(current)} vendors={vendors} canManage={true} createCompanyInvite={createCompanyInvite} updateCompanyMember={updateCompanyMember} removeCompanyMember={removeCompanyMember}/></main>;
}
