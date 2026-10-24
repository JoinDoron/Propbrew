import { requireCapability } from '@/server/guard';
import { constructionWorld } from '@/server/reads/construction';
import { NOW_MS } from '@/domain/ppm';
import { safetyStats, permitClashes, isOverdue } from '@/domain/construction';
import { SafetyWorkspace, type PermitRow, type EventRow, type TalkRow } from '@/components/construction/safety-workspace';

/** Site Safety & Permits — days since the last lost-time injury, the live
 *  permit-to-work register with lapse detection and same-place clash detection,
 *  the event log (near misses count as good reporting) and toolbox talks. */
export default async function ConstructionSafetyPage() {
  const { actor } = await requireCapability('reports_analytics', 'read', 'construction');
  const world = constructionWorld(actor);

  const counts = new Map<string, number>();
  for (const p of world.safetyPermits) counts.set(p.projectId, (counts.get(p.projectId) ?? 0) + 1);
  const projectId = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? world.projects[0]?.id ?? '';
  const project = world.projects.find((p) => p.id === projectId);

  const permits = world.safetyPermits.filter((p) => p.projectId === projectId);
  const events = world.safetyEvents.filter((e) => e.projectId === projectId);
  const talks = world.toolboxTalks.filter((t) => t.projectId === projectId);

  const clashPairs = permitClashes(permits);
  const clashIds = new Set(clashPairs.flatMap((c) => [c.a.id, c.b.id]));
  const zoneLabel = (id?: string) => world.zones.find((z) => z.id === id)?.label;

  const permitRows: PermitRow[] = [...permits]
    .sort((a, b) => (a.status === 'closed' ? 1 : 0) - (b.status === 'closed' ? 1 : 0) || Date.parse(a.validFromISO) - Date.parse(b.validFromISO))
    .map((p) => ({
      id: p.id, ref: p.ref, type: p.type, location: p.location, requestedBy: p.requestedBy, supervisor: p.supervisor,
      status: p.status, validFromISO: p.validFromISO, validToISO: p.validToISO, controls: [...p.controls],
      expired: p.status === 'active' && isOverdue(p.validToISO, NOW_MS), clash: clashIds.has(p.id),
    }));

  const eventRows: EventRow[] = [...events]
    .sort((a, b) => Date.parse(b.atISO) - Date.parse(a.atISO))
    .map((e) => ({ id: e.id, kind: e.kind, title: e.title, atISO: e.atISO, reportedBy: e.reportedBy, lostDays: e.lostDays, closed: e.closed, action: e.action, zoneLabel: zoneLabel(e.zoneId) }));

  const talkRows: TalkRow[] = [...talks].sort((a, b) => Date.parse(b.atISO) - Date.parse(a.atISO)).map((t) => ({ id: t.id, topic: t.topic, atISO: t.atISO, attendees: t.attendees, deliveredBy: t.deliveredBy }));

  return (
    <div className="pb-page">
      <SafetyWorkspace
        permits={permitRows}
        events={eventRows}
        talks={talkRows}
        clashes={clashPairs.map((c) => ({ aRef: c.a.ref, bRef: c.b.ref, location: c.a.location, aType: c.a.type, bType: c.b.type }))}
        stats={safetyStats(events, permits, talks, NOW_MS)}
        projectName={project?.name ?? 'Site'}
      />
    </div>
  );
}
