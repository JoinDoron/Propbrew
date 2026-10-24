import { requireCapability } from '@/server/guard';
import { constructionWorld } from '@/server/reads/construction';
import { zoneProgress, zoneBand, activeLevel, twinRollup } from '@/domain/construction';
import { TwinWorkspace, type TwinZone } from '@/components/construction/twin-workspace';
import { withDurableRead } from '@/server/data/durable-records';

/** Site Twin — the building floor by floor. Each level shows its four trade
 *  layers in construction sequence, so the shape of the build (structure racing
 *  ahead, finishes trailing) is legible at a glance; issues and RFIs are pinned
 *  to the level they block. */
export default async function ConstructionTwinPage() {
  return withDurableRead(async () => {
  const { actor } = await requireCapability('reports_analytics', 'read', 'construction');
  const world = constructionWorld(actor);

  const counts = new Map<string, number>();
  for (const z of world.zones) counts.set(z.projectId, (counts.get(z.projectId) ?? 0) + 1);
  const projectId = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? world.projects[0]?.id ?? '';
  const project = world.projects.find((p) => p.id === projectId);
  const zones = world.zones.filter((z) => z.projectId === projectId);

  const rows: TwinZone[] = zones.map((z) => ({
    id: z.id, level: z.level, label: z.label, block: z.block, layers: { ...z.layers },
    progress: zoneProgress(z), band: zoneBand(zoneProgress(z)),
    openIssues: z.openIssues, openRfis: z.openRfis,
    tasks: world.tasks.filter((t) => t.zoneId === z.id).map((t) => ({ name: t.name, percentComplete: t.percentComplete, status: t.status })),
  }));

  const roll = twinRollup(zones);

  return (
    <div className="pb-page">
      <TwinWorkspace
        zones={rows}
        projectName={project?.name ?? 'Project'}
        kpis={{ ...roll, activeLevel: activeLevel(zones) }}
      />
    </div>
  );
  });
}
