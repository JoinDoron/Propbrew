import { requireCapability } from '@/server/guard';
import { repos, seed } from '@/server/data';
import { effectiveLevel } from '@/lib/authz';
import { NOW_MS } from '@/domain/ppm';
import { CopilotWorkspace } from '@/components/facility/copilot-workspace';
import { getTenantModel, getUsage } from '@/server/copilot/metering';
import type { CopilotWorld } from '@/domain/facility';

/** AI Facility Copilot — reads across every facility signal (alarms, generators,
 *  inventory, contracts, permits, incidents) and fuses them into one ranked list
 *  of actionable priorities, plus a deterministic natural-language Q&A. Actions
 *  fire the real facility mutations (dispatch WO, refuel, receive stock, ack). */
export default async function CopilotPage() {
  const { actor } = await requireCapability('assets_ppm');
  const world: CopilotWorld = {
    systems: [...repos.buildingSystems.list(actor).items],
    alarms: [...repos.facilityAlarms.list(actor).items],
    generators: [...repos.facilityGenerators.list(actor).items],
    parts: [...repos.facilityParts.list(actor).items],
    contracts: [...repos.facilityContracts.list(actor).items],
    permits: [...repos.facilityPermits.list(actor).items],
    incidents: [...repos.facilityIncidents.list(actor).items],
    sensors: [...repos.facilitySensors.list(actor).items],
    nowMs: NOW_MS,
  };
  const userName = seed.users.find((u) => u.id === actor.userId)?.name ?? 'there';
  const tenantId = actor.tenantId ?? 't-lekki';
  const level = effectiveLevel(actor, 'reports_analytics');

  return (
    <div className="max-w-[880px] mx-auto">
      <CopilotWorkspace
        world={world}
        userName={userName}
        model={getTenantModel(tenantId)}
        usage={getUsage(tenantId)}
        canConfigure={level === 'M' || level === 'F'}
      />
    </div>
  );
}
