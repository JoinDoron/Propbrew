import { PageHeader } from '@/components/ui/page-header';
import { requireCapability } from '@/server/guard';
import { seed } from '@/server/data';
import { planFor, tenantHealth, tenantLabel } from '@/domain/platform-admin';
import { TenantsWorkspace, type TenantDetail } from '@/components/admin/tenants-workspace';
import { withDurableRead } from '@/server/data/durable-records';

const OPEN_WO = (s: string) => !['closed', 'cancelled', 'rejected', 'verified'].includes(s);
const ARREARS = ['overdue', 'in_arrears', 'escalated'];

/** SC-07 — tenant management. Platform Admin is the only role that reads across
 *  tenants (§8.2). Per-tenant health, subscription/MRR and vitals; drill in to
 *  suspend/reactivate or onboard. Every cross-tenant read is an SC-10 event. */
export default async function TenantsPage() {
  return withDurableRead(async () => {
  await requireCapability('tenant_config');

  const tenantIds = Array.from(new Set(seed.sites.map((s) => s.tenantId)));
  const tenants: TenantDetail[] = tenantIds
    .map((id) => {
      const sites = seed.sites.filter((s) => s.tenantId === id);
      const units = sites.reduce((a, s) => a + s.unitCount, 0);
      const users = seed.users.filter((u) => u.tenantId === id);
      const wos = seed.workOrders.filter((w) => w.tenantId === id);
      const invoices = seed.invoices.filter((i) => i.tenantId === id);
      const openWO = wos.filter((w) => OPEN_WO(w.status)).length;
      const overdue = invoices.filter((i) => ARREARS.includes(i.status)).length;
      const suspendedUsers = users.filter((u) => u.status === 'suspended').length;
      const { plan, mrrMinor } = planFor(units);
      const h = tenantHealth({ units, users: users.length, activeUsers: users.filter((u) => u.status === 'active').length, suspendedUsers, openWorkOrders: openWO, totalWorkOrders: wos.length, overdueInvoices: overdue });
      return { id, label: tenantLabel(id), plan, mrrMinor, sites: sites.map((s) => s.name), units, users: users.length, activeUsers: users.filter((u) => u.status === 'active').length, suspendedUsers, workOrders: wos.length, openWO, overdue, score: h.score, band: h.band, healthLabel: h.label };
    })
    .sort((a, b) => b.mrrMinor - a.mrrMinor);

  return (
    <div className="pb-page">
      <PageHeader title="Organisations" subtitle="Review tenant health, plans and account controls." />
      <TenantsWorkspace tenants={tenants} />
    </div>
  );
  });
}
