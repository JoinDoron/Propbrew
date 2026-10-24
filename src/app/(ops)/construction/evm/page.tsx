import { requireCapability } from '@/server/guard';
import { repos } from '@/server/data';
import { projectEVMOf, forecastFinishISO, moneySCurve } from '@/domain/construction';
import { EvmCockpit, type EvmView } from '@/components/construction/evm-cockpit';

const OPEN_PO = ['issued', 'acknowledged', 'part_delivered', 'approved'];

/** Earned Value Cockpit — the commercial crown: the full PMI suite (PV/EV/AC →
 *  CPI/SPI/CV/SV/EAC/ETC/VAC/TCPI), an S-curve with a forecast tail, budget vs
 *  committed vs actual by cost code, and the cash finance must fund. */
export default async function ConstructionEvmPage() {
  const { actor } = await requireCapability('reports_analytics', 'read', 'construction');
  const projects = repos.constructionProjects.list(actor).items;
  const costCodes = repos.constructionCostCodes.list(actor).items;
  const pos = repos.constructionOrders.list(actor).items;

  const views: EvmView[] = projects
    .filter((p) => p.status !== 'planning')
    .map((p) => {
      const evm = projectEVMOf(p, costCodes);
      const ff = forecastFinishISO(p, evm.spi);
      const mine = costCodes.filter((c) => c.projectId === p.id);
      const openPos = pos.filter((o) => o.projectId === p.id && OPEN_PO.includes(o.status));
      // Group the outstanding value of open POs by their expected month.
      const byMonth = new Map<string, number>();
      for (const o of openPos) {
        const outstanding = Math.round(o.value.minor * (1 - o.deliveredQty / Math.max(1, o.qty)));
        const key = o.expectedISO.slice(0, 7);
        byMonth.set(key, (byMonth.get(key) ?? 0) + outstanding);
      }
      return {
        projectId: p.id, name: p.name, code: p.code,
        bac: evm.bac, pv: evm.pv, ev: evm.ev, ac: evm.ac, cv: evm.cv, sv: evm.sv,
        cpi: evm.cpi, spi: evm.spi, eac: evm.eac, etc: evm.etc, vac: evm.vac, tcpi: evm.tcpi,
        costBand: evm.costBand, scheduleBand: evm.scheduleBand,
        curve: moneySCurve(evm, p.percentComplete / 100, 12),
        nowFrac: p.percentComplete / 100,
        cashByMonth: [...byMonth.entries()].sort().map(([label, minor]) => ({ label, minor })),
        codes: mine.map((c) => ({ code: c.code, name: c.name, budget: c.budget.minor, committed: c.committed.minor, actual: c.actual.minor, earnedPercent: c.earnedPercent, plannedPercent: c.plannedPercent, variance: c.budget.minor - c.committed.minor })),
        forecastFinishISO: ff.iso, slipDays: ff.slipDays, plannedFinishISO: p.plannedFinishISO,
      };
    });

  return (
    <div className="pb-page">
      <EvmCockpit views={views} />
    </div>
  );
}
