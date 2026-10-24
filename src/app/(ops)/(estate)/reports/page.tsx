import { requireCapability } from '@/server/guard';
import { can } from '@/lib/authz';
import { repos } from '@/server/data';
import { listEstateWorkOrders } from '@/server/reads/estate-work-orders';
import { PageHeader } from '@/components/ui/page-header';
import { ScopeBanner } from '@/components/domain';
import { AskData } from '@/components/reports/ask-data';
import { MetricsExplorer } from '@/components/reports/metrics-explorer';
import { PageTabs } from '@/components/ui/page-tabs';
import type { Dataset } from '@/domain/reports';
import { withDurableRead } from '@/server/data/durable-records';

/** FM-07 / AI-S-02 — reporting & analytics. The AI-S-02 NL-query card sits above
 *  a metrics explorer: a traceable KPI gallery (each metric → its §14 requirement
 *  ids), a metric × dimension query builder with real work-order throughput
 *  trends, saved views and CSV export. Every figure is scoped exactly as its
 *  source list (§8.2); invoice-based metrics appear only if the actor may read
 *  billing. */
export default async function ReportsPage() {
  return withDurableRead(async () => {
  const { actor } = await requireCapability('reports_analytics', 'read', 'estate');
  const seesInvoices = can(actor, 'charges_invoicing', 'read').allowed;
  const dataset: Dataset = {
    workOrders: can(actor, 'work_orders', 'read').allowed ? listEstateWorkOrders(actor) : [],
    invoices: seesInvoices ? [...repos.invoices.list(actor).items] : [],
  };

  return (
    <div className="pb-page">
      <PageHeader title="Reports & Analytics" subtitle="Explore scoped estate records, compare native-currency metrics and export a traceable breakdown."
        scope={<ScopeBanner label={actor.allEstates ? 'all estates' : `${actor.estateIds.length} estate(s)`} />}
      />
      <PageTabs label="Reports and analytics sections" items={[
        { id: 'metrics', label: 'Metrics & exports', content: <MetricsExplorer dataset={dataset} seesInvoices={seesInvoices} /> },
        { id: 'ask', label: 'Ask your data', content: <AskData /> },
      ]} />
    </div>
  );
  });
}
