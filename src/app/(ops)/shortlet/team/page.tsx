import { can } from '@/lib/authz';
import { PageHeader } from '@/components/ui/page-header';
import { requireCapability } from '@/server/guard';
import { repos } from '@/server/data';
import { TEAM_ROLES, PERM_MODULES, TEAM_PERMISSIONS } from '@/domain/shortlet';
import { TeamWorkspace, type MemberRow } from '@/components/shortlet/team-workspace';
import { withDurableRead } from '@/server/data/durable-records';

/** FR-TM (Short-Let PMS) — team management with role-based access. Invite team
 *  members by role (owner / manager / accountant / housekeeper); each role's
 *  exact permissions are shown as a matrix. These are in-app module roles;
 *  financials are restricted by default (NFR-05). */
export default async function ShortletTeamPage() {
  return withDurableRead(async () => {
  const { actor } = await requireCapability('bookings_amenities', 'read', 'shortlet');
  const members: MemberRow[] = repos.shortletTeam.list(actor).items.map((m) => ({ id: m.id, name: m.name, phone: m.phone, role: m.role, status: m.status, lastActive: m.lastActive }));

  return (
    <div className="pb-page">
      <PageHeader title="Shortlet team" subtitle="Manage team members and understand role permissions." />
      <TeamWorkspace canCreate={can(actor, 'bookings_amenities', 'create').allowed} canUpdate={can(actor, 'bookings_amenities', 'update').allowed}
        members={members}
        roles={TEAM_ROLES.map((r) => ({ key: r.key, label: r.label, blurb: r.blurb }))}
        modules={[...PERM_MODULES]}
        matrix={TEAM_PERMISSIONS}
      />
    </div>
  );
  });
}
