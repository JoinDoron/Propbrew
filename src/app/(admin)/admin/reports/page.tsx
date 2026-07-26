import { requireCapability } from '@/server/guard';
import { seed } from '@/server/data';
import { Card, CardHeader, KpiCard, Table, Td, Th, TableRow } from '@/components/ui';
import { Building2, Users, Wrench, TrendingUp } from 'lucide-react';

/** FM-07 (platform) — cross-tenant analytics. Platform Admin is the only reader
 *  allowed across tenant boundaries (§8.2); every other role's reports are
 *  tenant-scoped. */
export default async function AdminReportsPage() {
  await requireCapability('reports_analytics');

  const tenants = [...new Set(seed.sites.map((s) => s.tenantId))];
  const TENANT_LABEL: Record<string, string> = { 't-lekki': 'Lekki Gardens', 't-ikoyi': 'Ikoyi Heights' };

  const perTenant = tenants.map((t) => ({
    id: t,
    label: TENANT_LABEL[t] ?? t,
    sites: seed.sites.filter((s) => s.tenantId === t).length,
    units: seed.sites.filter((s) => s.tenantId === t).reduce((a, s) => a + s.unitCount, 0),
    users: seed.users.filter((u) => u.tenantId === t).length,
    workOrders: seed.workOrders.filter((w) => w.tenantId === t).length,
  }));

  return (
    <div className="max-w-[1100px] mx-auto flex flex-col gap-3.5">
      <div className="grid grid-cols-1 min-[560px]:grid-cols-4 gap-3.5">
        <KpiCard label="Tenants" value={String(tenants.length)} icon={<Building2 size={18} />} />
        <KpiCard label="Total units" value={perTenant.reduce((a, t) => a + t.units, 0).toLocaleString()} icon={<Building2 size={18} />} iconBg="rgba(37,99,235,.12)" iconColor="#2563eb" />
        <KpiCard label="Total users" value={String(perTenant.reduce((a, t) => a + t.users, 0))} icon={<Users size={18} />} iconBg="rgba(99,102,241,.15)" iconColor="#6366f1" />
        <KpiCard label="Work orders" value={String(perTenant.reduce((a, t) => a + t.workOrders, 0))} icon={<Wrench size={18} />} iconBg="rgba(16,185,129,.12)" iconColor="#10b981" />
      </div>

      <Card padded={false}>
        <div className="p-4 sm:p-[18px] pb-0">
          <CardHeader title="By tenant" subtitle="Platform-wide breakdown (Platform Admin only)" action={<span className="inline-flex items-center gap-1.5 text-[12px] text-text-3"><TrendingUp size={14} /> Export</span>} />
        </div>
        <Table>
          <thead>
            <tr>
              <Th>Tenant</Th>
              <Th className="text-right">Sites</Th>
              <Th className="text-right">Units</Th>
              <Th className="text-right">Users</Th>
              <Th className="text-right">Work orders</Th>
            </tr>
          </thead>
          <tbody>
            {perTenant.map((t) => (
              <TableRow key={t.id}>
                <Td className="text-[13px] font-medium">{t.label}</Td>
                <Td className="text-right font-mono text-[13px]">{t.sites}</Td>
                <Td className="text-right font-mono text-[13px]">{t.units.toLocaleString()}</Td>
                <Td className="text-right font-mono text-[13px]">{t.users}</Td>
                <Td className="text-right font-mono text-[13px]">{t.workOrders}</Td>
              </TableRow>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
