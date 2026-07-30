import { requireCapability } from '@/server/guard';
import { repos } from '@/server/data';
import { stockSignal, stockValueMinor } from '@/domain/facility';
import { InventoryWorkspace } from '@/components/facility/inventory-workspace';

/** Inventory — spare-parts stock with stock-out forecasting and receive-to-stock.
 *  Below-reorder and soon-to-stock-out parts are flagged so nothing runs dry
 *  mid-repair. */
export default async function InventoryPage() {
  const { actor } = await requireCapability('assets_ppm');
  const parts = repos.facilityParts.list(actor).items;

  return (
    <div className="max-w-[980px] mx-auto">
      <InventoryWorkspace
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
