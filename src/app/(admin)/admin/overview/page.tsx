import { requireCapability } from '@/server/guard';
import { seed } from '@/server/data';
import { getAllHistory } from '@/server/data/store';
import { planFor, tenantHealth, aiUsage, tenantLabel, isSecurityEvent, isFinancialEvent } from '@/domain/platform-admin';
import { AI_REQUIREMENTS } from '@/domain';
import { PlatformOverview, type TenantRow, type EventRow, type SystemRow } from '@/components/admin/platform-overview';

const OPEN_WO = (s: string) => !['closed', 'cancelled', 'rejected', 'verified'].includes(s);
const ARREARS = ['overdue', 'in_arrears', 'escalated'];

/** SC-07 / SC-10 — Platform Overview. The Platform-Admin command centre: MRR &
 *  tenant health across every tenant (§8.2), AI spend vs cap, live security/audit
 *  feed and system status. Cross-tenant reads are legitimate here and only here. */
export default async function AdminOverviewPage() {
  await requireCapability('tenant_config');

  const tenantIds = Array.from(new Set(seed.sites.map((s) => s.tenantId)));
  const tenants: TenantRow[] = tenantIds
    .map((id) => {
      const units = seed.sites.filter((s) => s.tenantId === id).reduce((a, s) => a + s.unitCount, 0);
      const users = seed.users.filter((u) => u.tenantId === id);
      const wos = seed.workOrders.filter((w) => w.tenantId === id);
      const invoices = seed.invoices.filter((i) => i.tenantId === id);
      const { plan, mrrMinor } = planFor(units);
      const h = tenantHealth({
        units,
        users: users.length,
        activeUsers: users.filter((u) => u.status === 'active').length,
        suspendedUsers: users.filter((u) => u.status === 'suspended').length,
        openWorkOrders: wos.filter((w) => OPEN_WO(w.status)).length,
        totalWorkOrders: wos.length,
        overdueInvoices: invoices.filter((i) => ARREARS.includes(i.status)).length,
      });
      return { id, label: tenantLabel(id), plan, mrrMinor, units, users: users.length, score: h.score, band: h.band, healthLabel: h.label };
    })
    .sort((a, b) => b.mrrMinor - a.mrrMinor);

  const totalCalls = AI_REQUIREMENTS.reduce((a, f) => a + (f.priority === 'Must' ? 3800 : f.priority === 'Should' ? 1240 : 0), 0);
  const ai = aiUsage(totalCalls);
  const incidents = seed.sosEvents.filter((s) => !['reviewed', 'resolved'].includes(s.status)).length;

  const events: EventRow[] = getAllHistory().slice(0, 8).map((e) => ({
    machine: e.machine, event: e.event, actorName: e.actorName, at: e.at, recordId: e.recordId,
    security: isSecurityEvent(e.machine, e.event), financial: isFinancialEvent(e.machine, e.event),
  }));

  const systems: SystemRow[] = [
    { name: 'API & web app', status: 'operational' },
    { name: 'Payments gateway (SC-02)', status: 'operational' },
    { name: 'AI provider + fallback', status: 'operational' },
    { name: 'Notifications (SC-09)', status: 'degraded' },
  ];

  return (
    <div className="max-w-[1200px] mx-auto">
      <PlatformOverview
        totals={{ tenants: tenants.length, units: tenants.reduce((a, t) => a + t.units, 0), users: tenants.reduce((a, t) => a + t.users, 0), mrrMinor: tenants.reduce((a, t) => a + t.mrrMinor, 0), incidents, aiCostMinor: ai.costMinor }}
        tenants={tenants}
        events={events}
        ai={{ calls: ai.calls, capPct: ai.capPct }}
        systems={systems}
      />
    </div>
  );
}
