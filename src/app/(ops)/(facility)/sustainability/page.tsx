import { can } from '@/lib/authz';
import { PageHeader } from '@/components/ui/page-header';
import { requireCapability } from '@/server/guard';
import { repos } from '@/server/data';
import { gridReliancePct, co2Kg, esgScore, reductionScenarios } from '@/domain/facility';
import { SustainabilityWorkspace, type MonthPoint } from '@/components/facility/sustainability-workspace';

/** Sustainability — Nigeria-first ESG: diesel carbon, grid-vs-genset mix, water,
 *  a 6-month carbon trend, modelled reduction pathways (solar/service/LED/gas with
 *  CO₂, ₦ savings and payback), and editable reduction targets. */
export default async function SustainabilityPage() {
  const { actor } = await requireCapability('assets_ppm', 'read', 'facility');
  const generators = repos.facilityGenerators.list(actor).items;
  const months = repos.emissionMonths.list(actor).items;
  const targets = repos.sustainabilityTargets.list(actor).items;

  const litresMonth = generators.reduce((n, g) => n + Math.round(g.runtimeHoursMonth * g.litresPerHour), 0);
  const reliance = gridReliancePct(generators);
  const latest = months[months.length - 1];
  const trend: MonthPoint[] = months.map((m) => ({ label: m.monthLabel, co2Kg: co2Kg(m.dieselLitres), dieselLitres: m.dieselLitres }));

  return (
    <div className="pb-page">
      <PageHeader title="Sustainability" subtitle="Resource efficiency, carbon estimates and your targets." />
      <SustainabilityWorkspace
        canMutate={can(actor, 'assets_ppm', 'update').allowed}
        esg={esgScore(reliance.gensetPct, targets)}
        kpis={{ carbonKg: co2Kg(litresMonth), gensetPct: reliance.gensetPct, waterM3: latest?.waterM3 ?? 0, renewableReadiness: reliance.gridPct }}
        months={trend}
        mix={{ gridKwh: latest?.gridKwh ?? 0, gensetKwh: latest?.gensetKwh ?? 0 }}
        scenarios={reductionScenarios(litresMonth)}
        targets={[...targets]}
      />
    </div>
  );
}
