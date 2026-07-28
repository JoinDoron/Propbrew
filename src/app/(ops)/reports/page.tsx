import { requireCapability } from '@/server/guard';
import { can } from '@/lib/authz';
import { repos } from '@/server/data';
import { CardHeader } from '@/components/ui';
import { ScopeBanner } from '@/components/domain';
import { AskData } from '@/components/reports/ask-data';
import { MetricsExplorer } from '@/components/reports/metrics-explorer';
import type { Dataset } from '@/domain/reports';

/** FM-07 / AI-S-02 — reporting & analytics. The AI-S-02 NL-query card sits above
 *  a metrics explorer: a traceable KPI gallery (each metric → its §14 requirement
 *  ids), a metric × dimension query builder with real work-order throughput
 *  trends, saved views and CSV export. Every figure is scoped exactly as its
 *  source list (§8.2); invoice-based metrics appear only if the actor may read
 *  billing. */
export default async function ReportsPage() {
  const { actor } = await requireCapability('reports_analytics');
  const seesInvoices = can(actor, 'charges_invoicing', 'read').allowed;
  const dataset: Dataset = {
    workOrders: [...repos.workOrders.list(actor).items],
    invoices: seesInvoices ? [...repos.invoices.list(actor).items] : [],
  };

  return (
    <div className="max-w-[1100px] mx-auto flex flex-col gap-3.5">
      <ScopeBanner label={actor.allEstates ? 'all estates' : `${actor.estateIds.length} estate(s)`} />
      <CardHeader title="Reports & Analytics" subtitle="Ask in natural language, or explore traceable metrics — scoped, with throughput trends and CSV export" />
      <AskData />
      <MetricsExplorer dataset={dataset} seesInvoices={seesInvoices} />
    </div>
  );
}
