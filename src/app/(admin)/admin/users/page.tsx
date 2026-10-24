import { PageHeader } from '@/components/ui/page-header';
import { requireCapability } from '@/server/guard';
import { db } from '@/server/data/store';
import { can, ROLE_LABELS, type Role } from '@/lib/authz';
import { tenantLabel } from '@/domain/platform-admin';
import { UsersWorkspace, type UserRow } from '@/components/admin/users-workspace';
import { withDurableRead } from '@/server/data/durable-records';

/** SC-01 — users & roles across every tenant (Platform Admin, cross-tenant).
 *  Deny-by-default, server-enforced. Search/filter by role, status and tenant;
 *  suspend or reactivate an account (re-checked server-side). */
export default async function AdminUsersPage() {
  return withDurableRead(async () => {
  const { actor } = await requireCapability('users_roles');
  const users: UserRow[] = db.users.map((u) => ({
    id: u.id, name: u.name, email: u.email, tenantLabel: tenantLabel(u.tenantId),
    roles: u.roles.map((r) => ({ key: r, label: ROLE_LABELS[r as Role] ?? r })),
    status: u.status, lastActive: u.lastActive,
  }));

  return (
    <div className="pb-page">
      <PageHeader title="Users & roles" subtitle="Manage user access across authorised platform tenants." />
      <UsersWorkspace users={users} canMutate={can(actor, 'users_roles', 'update').allowed} />
    </div>
  );
  });
}
