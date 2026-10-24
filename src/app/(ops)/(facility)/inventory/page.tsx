import { can } from '@/lib/authz';
import { PageHeader } from '@/components/ui/page-header';
import { requireCapability } from '@/server/guard';
import { repos } from '@/server/data';
import { stockSignal, stockValueMinor } from '@/domain/facility';
import { InventoryWorkspace } from '@/components/facility/inventory-workspace';

/** Inventory — spare-parts stock with stock-out forecasting and receive-to-stock.
 *  Below-reorder and soon-to-stock-out parts are flagged so nothing runs dry
 *  mid-repair. */
export default async function InventoryPage() {
  const { actor } = await requireCapability('assets_ppm', 'read', 'facility');
  const parts = repos.facilityParts.list(actor).items;

  return (
    <div className="pb-page">
      <PageHeader title="Inventory" subtitle="Track spare parts, stock signals and receiving." />
      <InventoryWorkspace
        canMutate={can(actor, 'assets_ppm', 'update').allowed}
        parts={[...parts]}
        kpis={{
          total: parts.length,
          belowReorder: parts.filter((p) => stockSignal(p).belowReorder).length,
          stockValueMinor: stockValueMinor(parts),
          stockoutsSoon: parts.filter((p) => { const s = stockSignal(p); return s.daysToStockout !== null && s.daysToStockout <= 7; }).length,
        }}
      />
    </div>
  );
}
