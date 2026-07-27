import { requireCapability } from '@/server/guard';
import { effectiveLevel } from '@/lib/authz';
import { repos, runtimeForActor } from '@/server/data';
import { scoreAssets, coverageGaps } from '@/server/data/ppm-risk';
import { NOW, WEEKLY_CAPACITY_HOURS } from '@/domain/ppm';
import { CardHeader } from '@/components/ui';
import { ScopeBanner } from '@/components/domain';
import { MaintenanceWorkspace } from '@/components/ppm/maintenance-workspace';
import type { PpmData } from '@/components/ppm/types';

/** FM-02 preventive maintenance + AI-F-01 predictive maintenance — a calendar-
 *  first workspace. Everything is computed from the actor's scoped repos, so the
 *  calendar, risk engine and runtime feeds never cross the estate/tenant
 *  boundary (§8.2). Modify actions are Facility-Manager-gated (assets_ppm = M);
 *  everyone else gets a read-only workspace. */
export default async function PpmPage() {
  const { actor } = await requireCapability('assets_ppm');
  const canMutate = effectiveLevel(actor, 'assets_ppm') === 'M' || effectiveLevel(actor, 'assets_ppm') === 'F';

  const plans = repos.ppmPlans.list(actor).items;
  const nameById = new Map(repos.assets.list(actor).items.map((a) => [String(a.id), a.name]));

  const data: PpmData = {
    now: NOW,
    canMutate,
    weeklyCapacityHours: WEEKLY_CAPACITY_HOURS,
    occurrences: [...repos.ppmOccurrences.list(actor).items],
    plans: plans.map((p) => ({
      id: String(p.id),
      assetId: String(p.assetId),
      assetName: p.assetName,
      category: p.category,
      frequency: p.frequency,
      basis: p.basis,
      leadTimeDays: p.leadTimeDays,
      runtimeIntervalHours: p.runtimeIntervalHours,
      checklist: [...p.checklist],
      evidenceRequired: p.evidenceRequired,
      lastServicedAt: p.lastServicedAt,
      estimatedHours: p.estimatedHours,
      assignee: p.assignee,
      statutory: p.statutory,
      statutoryDeadline: p.statutoryDeadline,
      nextDue: p.nextDue,
      rescheduleCount: p.rescheduleCount,
    })),
    assessments: scoreAssets(actor),
    runtime: runtimeForActor(actor).map((r) => ({ ...r, assetName: nameById.get(String(r.assetId)) ?? String(r.assetId) })),
    gaps: coverageGaps(actor).map((a) => ({ id: String(a.id), name: a.name, category: a.category, locationLabel: a.locationLabel, status: a.status })),
  };

  return (
    <div className="max-w-[1200px] mx-auto flex flex-col gap-3.5">
      <ScopeBanner label={actor.allEstates ? 'all estates' : `${actor.estateIds.length} estate(s)`} />
      <CardHeader title="Maintenance" subtitle="Preventive schedule, runtime-aware, with AI-F-01 failure prediction" />
      <MaintenanceWorkspace {...data} />
    </div>
  );
}
