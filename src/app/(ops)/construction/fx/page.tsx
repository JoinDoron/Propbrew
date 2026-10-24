import { requireCapability } from '@/server/guard';
import { can } from '@/lib/authz';
import { constructionWorld } from '@/server/reads/construction';
import { fxTable, fxExposure, fxPositions, fxUnrealizedMinor, fxMovementPct, type FxRate } from '@/domain/construction';
import { FxWorkspace, type RatePanelRow } from '@/components/construction/fx-workspace';
import { withDurableRead } from '@/server/data/durable-records';

/** FX exposure — the last of the PRD's cost-control gaps. The books stay in NGN;
 *  foreign-denominated commitments are revalued on their outstanding balance as
 *  the naira moves, with a reporting-currency lens, sensitivity, and a repricing
 *  action that lands in the audit log + reason Pareto. */
export default async function ConstructionFxPage() {
  return withDurableRead(async () => {
  const { actor } = await requireCapability('reports_analytics', 'read', 'construction');
  const canMutate = can(actor, 'reports_analytics', 'update').allowed;
  const world = constructionWorld(actor);

  const table = fxTable(world.fxRates);
  const rows = fxExposure(world.pos, table);
  const positions = fxPositions(rows);
  const exposedCurrencies = new Set(rows.map((r) => r.currency));

  const rates: RatePanelRow[] = [...world.fxRates]
    .map((r) => ({
      currency: r.currency, rate: r.rate, priorRate: r.priorRate,
      movementPct: fxMovementPct(r as FxRate), asOfISO: r.asOfISO,
      hasExposure: exposedCurrencies.has(r.currency),
    }))
    .sort((a, b) => Number(b.hasExposure) - Number(a.hasExposure) || a.currency.localeCompare(b.currency));

  return (
    <div className="pb-page">
      <FxWorkspace
        rows={rows}
        positions={positions}
        rates={rates}
        table={table}
        unrealizedMinor={fxUnrealizedMinor(rows)}
        spotExposureMinor={rows.reduce((n, r) => n + r.spotMinor, 0)}
        canMutate={canMutate}
      />
    </div>
  );
  });
}
