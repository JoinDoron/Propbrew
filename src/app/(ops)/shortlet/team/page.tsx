import { requireCapability } from '@/server/guard';
import { repos } from '@/server/data';
import { TEAM_ROLES, PERM_MODULES, TEAM_PERMISSIONS } from '@/domain/shortlet';
import { TeamWorkspace, type MemberRow } from '@/components/shortlet/team-workspace';

/** FR-TM (Short-Let PMS) — team management with role-based access. Invite team
 *  members by role (owner / manager / accountant / housekeeper); each role's
 *  exact permissions are shown as a matrix. These are in-app module roles;
 *  financials are restricted by default (NFR-05). */
export default async function ShortletTeamPage() {
  const { actor } = await requireCapability('bookings_amenities');
  const members: MemberRow[] = repos.shortletTeam.list(actor).items.map((m) => ({ id: m.id, name: m.name, phone: m.phone, role: m.role, status: m.status, lastActive: m.lastActive }));

  return (
    <div className="max-w-[900px] mx-auto">
      <TeamWorkspace
        members={members}
        roles={TEAM_ROLES.map((r) => ({ key: r.key, label: r.label, blurb: r.blurb }))}
        modules={[...PERM_MODULES]}
        matrix={TEAM_PERMISSIONS}
      />
    </div>
  );
}
