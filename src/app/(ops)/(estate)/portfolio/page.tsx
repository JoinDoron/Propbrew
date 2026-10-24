import { PageHeader } from '@/components/ui/page-header';
import { requireCapability } from '@/server/guard';
import { repos } from '@/server/data';
import { can } from '@/lib/authz';
import { NOW_MS } from '@/domain/ppm';
import { siteHealth, dieselCost, gridReliancePct, contractStatus, portfolioTotals } from '@/domain/facility';
import { PortfolioWorkspace, type PortfolioEstateVitals } from '@/components/facility/portfolio-workspace';

const OPEN_WO = new Set(['new', 'triaged', 'assigned', 'in_progress', 'on_hold', 'resolved']);
const UNPAID = new Set(['issued', 'partially_paid', 'overdue', 'in_arrears', 'escalated']);

/** Executive Portfolio — a per-estate rollup across every domain (systems health,
 *  work-order load, alarms, diesel spend, contract SLA risk, and — for money-
 *  cleared roles — arrears), ranked worst-first with a composite estate index.
 *  Scope-aware: an executive sees the whole portfolio; an estate manager sees theirs. */
export default async function PortfolioPage() {
  const { actor } = await requireCapability('reports_analytics', 'read', 'estate');
  const sites = repos.sites.all(actor);
  const systems = repos.buildingSystems.list(actor).items;
  const alarms = repos.facilityAlarms.list(actor).items;
  const generators = repos.facilityGenerators.list(actor).items;
  const contracts = repos.facilityContracts.list(actor).items;
  const workOrders = repos.workOrders.list(actor, { limit: 500 }).items;

  // Money is a separate capability — a facility manager holds reports_analytics
  // but NOT charges_invoicing, so guard the arrears read and hide the column.
  const canSeeMoney = can(actor, 'charges_invoicing', 'read').allowed;
  const invoices = canSeeMoney ? repos.invoices.list(actor, { limit: 500 }).items : [];
  const ngnInvoices = invoices.filter((invoice) => invoice.amount.currency === 'NGN' && invoice.paid.currency === 'NGN');
  const excludedCurrencyInvoices = invoices.length - ngnInvoices.length;

  const estates: PortfolioEstateVitals[] = sites.map((s) => {
    const sid = String(s.id);
    const sysAt = systems.filter((x) => x.siteId === sid);
    const gensAt = generators.filter((x) => x.siteId === sid);
    const woAt = workOrders.filter((w) => String(w.estateId) === sid || String(w.siteId) === sid);
    const openWo = woAt.filter((w) => OPEN_WO.has(w.status));
    const litresMonth = gensAt.reduce((n, g) => n + Math.round(g.runtimeHoursMonth * g.litresPerHour), 0);
    const arrears = canSeeMoney
      ? ngnInvoices.filter((i) => String(i.estateId) === sid && UNPAID.has(i.status)).reduce((n, i) => n + (i.amount.minor - i.paid.minor), 0)
      : null;
    return {
      siteId: sid, name: s.name, kind: s.kind,
      // Keep the numeric domain shape, but never present an empty system set as healthy.
      healthScore: sysAt.length ? siteHealth(sysAt).score : 0,
      systemCount: sysAt.length,
      openWos: openWo.length,
      overdueWos: openWo.filter((w) => w.resolveDueAt && Date.parse(w.resolveDueAt) < NOW_MS).length,
      openAlarms: alarms.filter((a) => a.siteId === sid && !a.acknowledged).length,
      dieselSpendMinor: dieselCost(litresMonth),
      gensetPct: gridReliancePct(gensAt).gensetPct,
      contractsAtRisk: contracts.filter((c) => c.siteId === sid && contractStatus(c, NOW_MS).daysLeft <= 45).length,
      arrearsMinor: arrears,
    };
  });

  return (
    <div className="pb-page">
      <PageHeader title="Portfolio" subtitle="A clear view of the estates in your authorised scope." />
      <PortfolioWorkspace estates={estates} totals={portfolioTotals(estates)} canSeeMoney={canSeeMoney}
        excludedCurrencyInvoices={excludedCurrencyInvoices}
        loadedRecordCounts={{ estates: sites.length, systems: systems.length, alarms: alarms.length, generators: generators.length, contracts: contracts.length, workOrders: workOrders.length, invoices: canSeeMoney ? invoices.length : undefined }} />
    </div>
  );
}
