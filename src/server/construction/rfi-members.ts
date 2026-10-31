import 'server-only';
import { withAuthTransaction } from '@/server/auth/database';
import type { CompanyPrincipal } from '@/server/auth/company';

export type RfiProjectMember = { userId: string; name: string; canRespond: boolean; packageIds: string[]; profileId: string | null };

/** Only active company members whose Construction membership covers this
 * project can receive an RFI or its in-app distribution. */
export async function rfiProjectMembers(principal: CompanyPrincipal, projectId: string): Promise<RfiProjectMember[]> {
  if (!projectId || projectId.length > 200) return [];
  return withAuthTransaction(principal.user.id, async (client) => {
    const result = await client.query<{ user_id: string; name: string; access: string; operational_profile: string | null; construction_package_ids: string[] }>(`
      select m.user_id,u.name,m.modules->>'construction' access,m.operational_profile,m.construction_package_ids
      from company_memberships m join auth_users u on u.id=m.user_id
      where m.tenant_id=$1::uuid and m.status='active' and m.modules->>'construction' in ('view','manage')
        and (m.company_role in ('owner','admin')
          or (coalesce(m.operational_profile,'') in ('project-manager','site-manager','quantity-surveyor','procurement-officer','planning-engineer','construction-hse','quality-inspector','site-engineer','materials-storekeeper','subcontractor','construction-field-worker','client-investor','consultant-approver') and m.construction_project_ids ? $2)
          or (coalesce(m.operational_profile,'') not in ('project-manager','site-manager','quantity-surveyor','procurement-officer','planning-engineer','construction-hse','quality-inspector','site-engineer','materials-storekeeper','subcontractor','construction-field-worker','client-investor','consultant-approver') and (m.all_construction_projects or m.construction_project_ids ? $2)))
      order by u.name,m.user_id`, [principal.company.id, projectId]);
    return result.rows.map((row) => ({
      userId: row.user_id,
      name: row.name,
      canRespond: row.access === 'manage' && row.operational_profile !== 'construction-field-worker',
      packageIds: row.construction_package_ids ?? [],
      profileId: row.operational_profile,
    }));
  }, principal.session.id);
}
