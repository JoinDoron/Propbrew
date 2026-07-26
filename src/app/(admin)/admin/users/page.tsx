import { requireCapability } from '@/server/guard';
import { seed } from '@/server/data';
import { ROLE_LABELS, type Role } from '@/lib/authz';
import { Card, CardHeader, StatusPill, Table, Td, Th, TableRow, Avatar } from '@/components/ui';
import type { Tone } from '@/lib/status-tones';

const STATUS_TONE: Record<string, Tone> = { active: 'success', invited: 'info', suspended: 'danger' };
const TENANT_LABEL: Record<string, string> = { 't-lekki': 'Lekki Gardens', 't-ikoyi': 'Ikoyi Heights' };

/** SC-01 — users & roles across every tenant (Platform Admin, cross-tenant). */
export default async function AdminUsersPage() {
  await requireCapability('users_roles');
  const users = seed.users; // platform admin scope is '*'

  return (
    <div className="max-w-[1100px] mx-auto">
      <Card padded={false}>
        <div className="p-4 sm:p-[18px] pb-0">
          <CardHeader title={`${users.length} users`} subtitle="Everyone across every tenant · deny-by-default, server-enforced (SC-01)" />
        </div>
        <Table>
          <thead>
            <tr>
              <Th>User</Th>
              <Th>Tenant</Th>
              <Th>Roles</Th>
              <Th>Status</Th>
              <Th className="max-[560px]:hidden">Last active</Th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <Td>
                  <div className="flex items-center gap-2.5">
                    <Avatar name={u.name} size={30} />
                    <div>
                      <div className="text-[13px] font-medium">{u.name}</div>
                      <div className="text-[11.5px] text-text-3">{u.email}</div>
                    </div>
                  </div>
                </Td>
                <Td className="text-[13px]">{TENANT_LABEL[u.tenantId] ?? u.tenantId}</Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    {u.roles.map((r) => (
                      <span key={r} className="text-[11px] px-1.5 py-0.5 rounded bg-surface-3 text-text-2">{ROLE_LABELS[r as Role]}</span>
                    ))}
                  </div>
                </Td>
                <Td><StatusPill status={u.status} tone={STATUS_TONE[u.status] ?? 'neutral'} /></Td>
                <Td className="max-[560px]:hidden text-[12.5px] text-text-3">{u.lastActive}</Td>
              </TableRow>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
