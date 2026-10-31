import { requireCapability } from '@/server/guard';
import { constructionWorld } from '@/server/reads/construction';
import { operatingClock } from '@/server/operating-clock';
import { safetyStats, permitClashes } from '@/domain/construction';
import { SafetyWorkspace, type PermitRow, type EventRow, type TalkRow } from '@/components/construction/safety-workspace';
import { withDurableRead } from '@/server/data/durable-records';
import { can } from '@/lib/authz';
import { nativeAuthEnabled } from '@/server/auth/mode';
import { getCompanyPrincipal } from '@/server/auth/company';
import { rfiProjectMembers } from '@/server/construction/rfi-members';

/** Site Safety & Permits — days since the last lost-time injury, the live
 *  permit-to-work register with lapse detection and same-place clash detection,
 *  the event log (near misses count as good reporting) and toolbox talks. */
export default async function ConstructionSafetyPage({ searchParams }: { searchParams: Promise<{ projectId?: string }> }) {
  return withDurableRead(async () => {
  const { nowMs: NOW_MS, dateISO: todayISO } = operatingClock();
  const { actor } = await requireCapability('reports_analytics', 'read', 'construction');
  const world = constructionWorld(actor);
  const params = await searchParams;
  const profile = actor.companyAccess?.operationalProfileId;
  const privileged = !actor.companyAccess || ['owner', 'admin'].includes(actor.companyAccess.companyRole) || !profile;
  const profileCan = (allowed: string[]) => privileged || (profile !== undefined && allowed.includes(profile));
  const canCreate = can(actor, 'reports_analytics', 'create').allowed;
  const canUpdate = can(actor, 'reports_analytics', 'update').allowed;

  const counts = new Map<string, number>();
  for (const p of world.safetyPermits) counts.set(p.projectId, (counts.get(p.projectId) ?? 0) + 1);
  const projectId = world.projects.find((item) => item.id === params.projectId)?.id ?? [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? world.projects[0]?.id ?? '';
  const project = world.projects.find((p) => p.id === projectId);
  const principal = projectId && nativeAuthEnabled() ? await getCompanyPrincipal() : null;
  const members = projectId && principal?.company.id === actor.tenantId
    ? await rfiProjectMembers(principal, projectId)
    : [{ userId: actor.userId, name: principal?.user.name ?? 'Current user', canRespond: true, packageIds: [], profileId: null }];

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
      status: p.status, validFromISO: p.validFromISO, validToISO: p.validToISO, controls: [...p.controls], requestedById: p.requestedById,
      reviewNote: p.reviewNote, activationNote: p.activationNote, closureNote: p.closureNote,
      expired: ['approved', 'active'].includes(p.status) && p.validToISO < todayISO, clash: clashIds.has(p.id),
    }));

  const eventRows: EventRow[] = [...events]
    .sort((a, b) => Number(Boolean(b.corrective && b.corrective.status !== 'verified' && b.corrective.dueISO < todayISO)) - Number(Boolean(a.corrective && a.corrective.status !== 'verified' && a.corrective.dueISO < todayISO)) || Date.parse(b.atISO) - Date.parse(a.atISO))
    .map((e) => ({ id: e.id, kind: e.kind, title: e.title, atISO: e.atISO, reportedBy: e.reportedBy, lostDays: e.lostDays, closed: e.closed, action: e.action, zoneLabel: zoneLabel(e.zoneId), corrective: e.corrective }));

  const talkRows: TalkRow[] = [...talks].sort((a, b) => Date.parse(b.atISO) - Date.parse(a.atISO)).map((t) => ({ id: t.id, topic: t.topic, atISO: t.atISO, attendees: t.attendees, deliveredBy: t.deliveredBy, location: t.location }));

  return (
    <div className="pb-page">
      <SafetyWorkspace
        permits={permitRows}
        events={eventRows}
        talks={talkRows}
        clashes={clashPairs.map((c) => ({ aRef: c.a.ref, bRef: c.b.ref, location: c.a.location, aType: c.a.type, bType: c.b.type }))}
        stats={safetyStats(events, permits, talks, NOW_MS)}
        projectName={project?.name ?? 'Site'}
        projectId={projectId}
        projects={world.projects.map((item) => ({ id: item.id, name: item.name }))}
        zones={world.zones.filter((item) => item.projectId === projectId).map((item) => ({ id: item.id, label: item.label }))}
        members={members.filter((item) => item.canRespond || item.profileId === 'construction-field-worker').map((item) => ({ userId: item.userId, name: item.name }))}
        actorId={actor.userId}
        todayISO={todayISO}
        canCreate={canCreate && profileCan(['project-director', 'project-manager', 'site-manager', 'construction-hse', 'site-engineer'])}
        canUpdate={canUpdate}
        canReviewPermit={canUpdate && profileCan(['project-director', 'project-manager', 'construction-hse'])}
        canActivatePermit={canUpdate && profileCan(['project-director', 'project-manager', 'site-manager', 'construction-hse'])}
        canAssignCorrection={canUpdate && profileCan(['project-director', 'project-manager', 'site-manager', 'construction-hse'])}
        canVerifyCorrection={canUpdate && profileCan(['project-director', 'project-manager', 'construction-hse'])}
      />
    </div>
  );
  });
}
