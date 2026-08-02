import { requireCapability } from '@/server/guard';
import { effectiveLevel } from '@/lib/authz';
import { constructionWorld } from '@/server/reads/construction';
import { db } from '@/server/data/store';
import { stockLedger, countVariance, reasonsFor } from '@/domain/construction';
import { StockWorkspace, type StockLine, type CountRow, type LedgerRow, type ReasonOpt } from '@/components/construction/stock-workspace';

/** Stock — the full movement set (receipt, issue, transfer, return, adjust), a
 *  perpetual ledger with running balances, and physical counts. Counting and
 *  adjusting are separate: a variance only moves the books once someone codes
 *  WHY, which is what makes the reason analytics real. */
export default async function ConstructionStockPage() {
  const { actor } = await requireCapability('reports_analytics');
  const canMutate = ['F', 'M'].includes(effectiveLevel(actor, 'reports_analytics'));
  const world = constructionWorld(actor);

  const matOf = (id: string) => world.materials.find((m) => m.id === id);
  const whOf = (id: string) => world.warehouses.find((w) => w.id === id);

  const lines: StockLine[] = world.stock.map((s) => {
    const m = matOf(s.materialId);
    return {
      materialId: s.materialId, name: m?.name ?? s.materialId, sku: m?.sku ?? '', unit: m?.unit ?? '',
      warehouseId: s.warehouseId, warehouseName: whOf(s.warehouseId)?.name ?? s.warehouseId,
      onHand: s.onHand, reserved: s.reserved, unitCostMinor: m?.unitCost.minor ?? 0,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  // Running balances across every material, newest first for display.
  const ledger: LedgerRow[] = world.materials
    .flatMap((m) => stockLedger(world.movements, m.id).map((row) => ({
      id: row.movement.id, kind: row.movement.kind, materialName: m.name, qty: row.movement.qty,
      unit: m.unit, atISO: row.movement.atISO, by: row.movement.by, ref: row.movement.ref, runningQty: row.runningQty,
    })))
    .sort((a, b) => Date.parse(b.atISO) - Date.parse(a.atISO));

  const counts: CountRow[] = db.constructionStockCounts.map((c) => {
    const m = matOf(c.materialId);
    return {
      id: c.id, ref: c.ref, materialName: m?.name ?? c.materialId, unit: m?.unit ?? '',
      warehouseName: whOf(c.warehouseId)?.name ?? c.warehouseId,
      systemQty: c.systemQty, countedQty: c.countedQty, countedBy: c.countedBy, countedISO: c.countedISO,
      status: c.status, note: c.note,
      reasonLabel: world.reasonCodes.find((r) => r.id === c.reasonCodeId)?.label,
    };
  });

  const opt = (domain: 'stock_adjust' | 'stock_return'): ReasonOpt[] =>
    reasonsFor(world.reasonCodes, domain).map((c) => ({ id: c.id, label: `${c.code} — ${c.label}`, requiresNote: c.requiresNote }));

  const open = counts.filter((c) => c.status === 'open');

  return (
    <div className="max-w-[1000px] mx-auto">
      <StockWorkspace
        lines={lines}
        warehouses={world.warehouses.map((w) => ({ id: w.id, name: w.name }))}
        counts={counts}
        ledger={ledger}
        adjustReasons={opt('stock_adjust')}
        returnReasons={opt('stock_return')}
        kpis={{
          valueMinor: lines.reduce((n, l) => n + l.onHand * l.unitCostMinor, 0),
          openCounts: open.length,
          varianceQty: open.reduce((n, c) => n + Math.abs(countVariance(c.systemQty, c.countedQty).deltaQty), 0),
          movements: world.movements.length,
        }}
        canMutate={canMutate}
      />
    </div>
  );
}
