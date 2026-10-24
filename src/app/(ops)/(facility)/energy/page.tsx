import { can } from '@/lib/authz';
import { PageHeader } from '@/components/ui/page-header';
import { requireCapability } from '@/server/guard';
import { repos } from '@/server/data';
import { NOW_MS } from '@/domain/ppm';
import { gridReliancePct, dieselCost, costPerKwhMinor, co2Kg } from '@/domain/facility';
import { EnergyWorkspace, type GenRow, type MeterRow } from '@/components/facility/energy-workspace';
import { withDurableRead } from '@/server/data/durable-records';

/** Energy & Utilities — Nigeria-first facility energy intelligence: generator
 *  runtime + fuel with AI refuel prediction and efficiency-anomaly detection,
 *  genset-vs-grid reliance, diesel spend + cost/kWh + carbon, and meter readings. */
export default async function EnergyPage() {
  return withDurableRead(async () => {
  const { actor } = await requireCapability('assets_ppm', 'read', 'facility');
  const sites = new Map<string, string>(repos.sites.all(actor).map((s) => [s.id, s.name]));
  const generators = repos.facilityGenerators.list(actor).items;
  const meters = repos.facilityMeters.list(actor).items;

  const litresMonth = generators.reduce((n, g) => n + Math.round(g.runtimeHoursMonth * g.litresPerHour), 0);
  const genRows: GenRow[] = generators.map((g) => ({ ...g, siteName: sites.get(g.siteId) ?? '' }));
  const meterRows: MeterRow[] = meters.map((m) => ({ id: m.id, label: m.label, kind: m.kind, unit: m.unit, reading: m.reading, previous: m.previous, atISO: m.atISO }));

  return (
    <div className="pb-page">
      <PageHeader title="Energy &amp; utilities" subtitle="Generators, fuel forecasts and meter readings." />
      <EnergyWorkspace
        canMutate={can(actor, 'assets_ppm', 'update').allowed}
        generators={genRows}
        meters={meterRows}
        kpis={{ dieselSpendMinor: dieselCost(litresMonth), litresMonth, costPerKwhMinor: costPerKwhMinor(), co2Kg: co2Kg(litresMonth) }}
        reliance={gridReliancePct(generators)}
        nowMs={NOW_MS}
      />
    </div>
  );
  });
}
