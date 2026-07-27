import { requireCapability } from '@/server/guard';
import { can } from '@/lib/authz';
import { repos } from '@/server/data';
import { scoreAssets, coverageGaps } from '@/server/data/ppm-risk';
import { NOW } from '@/domain/ppm';
import { DashboardWorkspace } from '@/components/dashboard/dashboard-workspace';
import type { DashData } from '@/components/dashboard/types';

const NOW_TS = `${NOW}T09:00:00Z`;
const CLOSED = ['closed', 'cancelled', 'rejected', 'verified'];

/**
 * FM-07 — the operations command center. It synthesises every module the actor
 * can see into one ranked "attention feed" and a composite estate-health score.
 * Every figure is computed under the actor's scope (§8.2) and each section only
 * appears if the actor holds the capability behind it (an FM has no billing
 * grant, so no collections) — the dashboard adapts to who is looking.
 */
export default async function DashboardPage() {
  const { actor } = await requireCapability('reports_analytics');
  const scopeLabel = actor.tenantId ? (actor.allEstates ? 'all estates' : `${actor.estateIds.length} estate(s)`) : 'all tenants';

  const flags = {
    wo: can(actor, 'work_orders', 'read').allowed,
    inv: can(actor, 'charges_invoicing', 'read').allowed,
    sos: can(actor, 'security_sos', 'read').allowed,
    risk: can(actor, 'assets_ppm', 'read').allowed,
    compliance: can(actor, 'inspections_compliance', 'read').allowed,
  };

  const estates = repos.sites.all(actor).map((s) => ({ id: String(s.id), name: s.name }));
  const assetEstate = new Map(flags.risk ? repos.assets.list(actor).items.map((a) => [String(a.id), String(a.siteId)]) : []);
  const isOpen = (s: string) => !CLOSED.includes(s);

  const data: DashData = {
    now: NOW,
    scopeLabel,
    estates,
    flags,
    workOrders: flags.wo
      ? repos.workOrders.list(actor).items.map((w) => ({
          id: w.id, ref: w.ref, title: w.title, status: w.status, priority: w.priority,
          estateId: String(w.estateId), assigneeName: w.assigneeName, respondDueAt: w.respondDueAt,
          breached: isOpen(w.status) && (w.respondDueAt ?? '') < NOW_TS, cost: w.cost,
        }))
      : [],
    invoices: flags.inv
      ? repos.invoices.list(actor).items.map((i) => ({ id: i.id, ref: i.ref, estateId: String(i.estateId), status: i.status, amount: i.amount, paid: i.paid, residentName: i.residentName, agingDays: i.agingDays }))
      : [],
    sos: flags.sos
      ? repos.sosEvents.list(actor).items.map((s) => ({ id: s.id, ref: s.ref, estateId: String(s.estateId), status: s.status, residentName: s.residentName, ackSeconds: s.ackSeconds }))
      : [],
    risk: flags.risk
      ? scoreAssets(actor).map((r) => ({ assetId: String(r.assetId), assetName: r.assetName, estateId: assetEstate.get(String(r.assetId)) ?? '', score: r.score, band: r.band, topDriver: r.topDriver, suggestReason: r.suggestReason }))
      : [],
    obligations: flags.compliance
      ? repos.complianceObligations.list(actor).items.map((o) => ({ id: o.id, name: o.name, estateId: String(o.estateId), criticality: o.criticality, validUntil: o.validUntil, scopeLabel: o.scopeLabel }))
      : [],
    ppmOverdue: flags.risk
      ? repos.ppmOccurrences.list(actor).items.filter((o) => o.status === 'overdue').map((o) => ({ id: o.id, assetName: o.assetName, estateId: String(o.siteId), dueDate: o.dueDate, frequency: o.frequency }))
      : [],
    inspectionsOverdue: flags.compliance
      ? repos.inspections.list(actor).items.filter((i) => i.status === 'overdue').map((i) => ({ id: i.id, ref: i.ref, estateId: String(i.estateId), template: i.template }))
      : [],
    coverageGaps: flags.risk
      ? coverageGaps(actor).map((a) => ({ id: String(a.id), name: a.name, estateId: String(a.siteId) }))
      : [],
  };

  return (
    <div className="max-w-[1200px] mx-auto">
      <DashboardWorkspace {...data} />
    </div>
  );
}
