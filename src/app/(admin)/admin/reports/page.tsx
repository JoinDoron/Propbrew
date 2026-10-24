import { PageHeader } from '@/components/ui/page-header';
import { requireCapability } from '@/server/guard';
import { seed } from '@/server/data';
import { Card, CardHeader, KpiCard, Table, Td, Th, TableRow } from '@/components/ui';
import { Building2, Users, Wrench } from 'lucide-react';
import { PageTabs } from '@/components/ui/page-tabs';
import { withDurableRead } from '@/server/data/durable-records';

/** FM-07 (platform) — cross-tenant analytics. Platform Admin is the only reader
 *  allowed across tenant boundaries (§8.2); every other role's reports are
 *  tenant-scoped. */
export default async function AdminReportsPage() {
  return withDurableRead(async () => {
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
    <div className="pb-page">
      <PageHeader title="Platform reports" subtitle="Cross-tenant metrics and operational reporting." />
      <PageTabs label="Platform report sections" items={[
        {
          id: 'overview', label: 'Overview', content: <div className="flex flex-col gap-6 min-w-0"><div className="grid grid-cols-1 min-[640px]:grid-cols-2 min-[1100px]:grid-cols-4 gap-6">
            <KpiCard label="Tenants" value={String(tenants.length)} icon={<Building2 size={18} />} />
            <KpiCard label="Total units" value={perTenant.reduce((a, t) => a + t.units, 0).toLocaleString()} icon={<Building2 size={18} />} iconBg="var(--primary-weak)" iconColor="var(--primary)" />
            <KpiCard label="Total users" value={String(perTenant.reduce((a, t) => a + t.users, 0))} icon={<Users size={18} />} iconBg="var(--primary-weak)" iconColor="var(--tone-progress)" />
            <KpiCard label="Work orders" value={String(perTenant.reduce((a, t) => a + t.workOrders, 0))} icon={<Wrench size={18} />} iconBg="color-mix(in srgb, var(--tone-success) 10%, var(--surface))" iconColor="var(--tone-success)" />
          </div></div>
        },
        {
          id: 'tenants', label: 'Tenant breakdown', content: <div className="flex flex-col gap-6 min-w-0"><Card padded={false}>
            <div className="p-6 pb-0">
              <CardHeader title="By tenant" subtitle="Recorded platform-wide breakdown (Platform Admin only)" />
            </div>
            <Table label="Cross-tenant report register">
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
                    <Td className="text-[14px] font-medium">{t.label}</Td>
                    <Td className="text-right font-mono text-[14px]">{t.sites}</Td>
                    <Td className="text-right font-mono text-[14px]">{t.units.toLocaleString()}</Td>
                    <Td className="text-right font-mono text-[14px]">{t.users}</Td>
                    <Td className="text-right font-mono text-[14px]">{t.workOrders}</Td>
                  </TableRow>
                ))}
              </tbody>
            </Table>
          </Card></div>
        }
      ]} />


    </div>
  );
  });
}
