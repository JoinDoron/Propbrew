import { requireCapability } from '@/server/guard';
import { can } from '@/lib/authz';
import { constructionWorld } from '@/server/reads/construction';
import { operatingClock } from '@/server/operating-clock';
import { weeklyDigest, projectEVMOf } from '@/domain/construction';
import { DigestWorkspace, type DigestView } from '@/components/construction/digest-workspace';
import { withDurableRead } from '@/server/data/durable-records';

/** AI Weekly Digest — a structured narrative compiled ONLY from approved records,
 *  with a source link on every section, per-section confidence, an honest
 *  coverage-gap guard, and an explicit human publish step. */
export default async function ConstructionDigestPage() {
  return withDurableRead(async () => {
  const { nowMs: NOW_MS, dateISO: TODAY } = operatingClock();
  const { actor } = await requireCapability('reports_analytics', 'read', 'construction');
  const canMutate = can(actor, 'reports_analytics', 'update').allowed;
  const canExport = can(actor, 'reports_analytics', 'export').allowed;
  const world = constructionWorld(actor);

  const views: DigestView[] = world.projects
    .filter((p) => p.status !== 'planning')
    .map((p) => {
      const d = weeklyDigest(p, world, NOW_MS);
      const evm = projectEVMOf(p, world.costCodes);
      return {
        projectId: p.id, projectName: p.name, code: p.code, weekOfISO: TODAY,
        sections: d.sections,
        coverageGaps: d.coverageGaps,
        deltas: [
          { label: 'Progress', value: `${p.percentComplete}%`, tone: p.percentComplete >= p.plannedPercent ? 'success' as const : 'warn' as const },
          { label: 'CPI', value: evm.cpi.toFixed(2), tone: evm.costBand },
          { label: 'SPI', value: evm.spi.toFixed(2), tone: evm.scheduleBand },
          { label: 'Forecast out-turn', value: `₦${(evm.eac / 100).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, tone: evm.vac < 0 ? 'danger' as const : 'success' as const },
        ],
      };
    });

  return (
    <div className="pb-page">
      <DigestWorkspace views={views} canMutate={canMutate} canExport={canExport} />
    </div>
  );
  });
}
