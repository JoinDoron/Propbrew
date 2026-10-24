import { notFound,redirect } from 'next/navigation';
import { nativeAuthEnabled } from '@/server/auth/mode';
import { getNativeIdentity,listCompanies } from '@/server/auth/company';
import { CompanyChooser } from '@/components/auth/company-chooser';
import { createCompany,selectCompany } from '@/server/actions/companies';
import { isDemoAccount } from '@/server/auth/demo-config';
export const dynamic = 'force-dynamic';
export default async function CompaniesPage() {
  if (!nativeAuthEnabled()) notFound();
  const identity=await getNativeIdentity(); if(!identity)redirect('/login');
  return <CompanyChooser companies={await listCompanies(identity)} currentCompanyId={identity.session.activeCompanyId} userName={identity.user.name} createCompany={createCompany} selectCompany={selectCompany} demo={isDemoAccount(identity.user.id)} />;
}
