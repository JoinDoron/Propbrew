import { requireCapability } from '@/server/guard';
import { effectiveLevel } from '@/lib/authz';
import { constructionWorld } from '@/server/reads/construction';
import { stockSignal, materialLeakage, moneyTrail } from '@/domain/construction';
import { MaterialsWorkspace, type MaterialRow, type TrailNodeRow, type MovementRow } from '@/components/construction/materials-workspace';

/** Materials & Money-Trail — stock positions with days-of-cover, the kobo money
 *  trail from approved budget through to booked cost, and leakage forensics
 *  (received − issued − on-hand) surfaced as an advisory variance to investigate. */
export default async function ConstructionMaterialsPage() {
  const { actor } = await requireCapability('reports_analytics');
  const canMutate = ['F', 'M'].includes(effectiveLevel(actor, 'reports_analytics'));
  const world = constructionWorld(actor);

  const onHandOf = (materialId: string) => world.stock.filter((s) => s.materialId === materialId).reduce((n, s) => n + s.onHand, 0);
  const consumedPerMonth = (materialId: string) => world.movements.filter((m) => m.materialId === materialId && m.kind === 'issue').reduce((n, m) => n + m.qty, 0);

  const materials: MaterialRow[] = world.materials.map((m) => {
    const onHand = onHandOf(m.id);
    const stock = world.stock.filter((s) => s.materialId === m.id);
    const sig = stockSignal(m, onHand, consumedPerMonth(m.id));
    const leak = materialLeakage(m.id, world.movements, onHand);
    return {
      id: m.id, sku: m.sku, name: m.name, category: m.category, unit: m.unit,
      onHand, reserved: stock.reduce((n, s) => n + s.reserved, 0), inTransit: stock.reduce((n, s) => n + s.inTransit, 0),
      reorderLevel: m.reorderLevel, unitCostMinor: m.unitCost.minor,
      belowReorder: sig.belowReorder, daysCover: sig.daysCover, band: sig.band,
      receivedQty: leak.receivedQty, issuedQty: leak.issuedQty, leakageQty: leak.leakageQty,
      leakagePct: leak.leakagePct, anomalous: leak.anomalous, leakageValueMinor: leak.leakageQty * m.unitCost.minor,
    };
  });

  // Trail the flagship build's money (the project carrying the most cost codes).
  const counts = new Map<string, number>();
  for (const c of world.costCodes) counts.set(c.projectId, (counts.get(c.projectId) ?? 0) + 1);
  const projectId = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? world.projects[0]?.id ?? '';
  const project = world.projects.find((p) => p.id === projectId);
  const trail: TrailNodeRow[] = moneyTrail(projectId, world.costCodes, world.pos);

  const movements: MovementRow[] = [...world.movements]
    .sort((a, b) => Date.parse(b.atISO) - Date.parse(a.atISO))
    .map((mv) => {
      const mat = world.materials.find((m) => m.id === mv.materialId);
      return { id: mv.id, materialName: mat?.name ?? mv.materialId, kind: mv.kind, qty: mv.qty, unit: mat?.unit ?? '', atISO: mv.atISO.slice(0, 10), ref: mv.ref, by: mv.by };
    });

  return (
    <div className="max-w-[1000px] mx-auto">
      <MaterialsWorkspace
        materials={materials}
        trail={trail}
        movements={movements}
        projectName={project?.name ?? 'Portfolio'}
        projectId={projectId}
        kpis={{
          stockValueMinor: materials.reduce((n, m) => n + m.onHand * m.unitCostMinor, 0),
          belowReorder: materials.filter((m) => m.belowReorder).length,
          leakageValueMinor: materials.reduce((n, m) => n + m.leakageValueMinor, 0),
          anomalies: materials.filter((m) => m.anomalous).length,
        }}
        canMutate={canMutate}
      />
    </div>
  );
}
