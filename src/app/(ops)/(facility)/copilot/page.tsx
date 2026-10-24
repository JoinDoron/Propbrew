import { requireCapability } from '@/server/guard';
import { repos, seed } from '@/server/data';
import { can } from '@/lib/authz';
import { NOW_MS } from '@/domain/ppm';
import { CopilotWorkspace } from '@/components/facility/copilot-workspace';
import { getTenantModel, type CopilotUsage } from '@/server/copilot/metering';
import { readCopilotLedgerUsage } from '@/server/ai/copilot-ledger';
import { isReviewActor, reviewLedgerTenantId, reviewModeEnabled } from '@/server/review-auth';
import type { CopilotWorld } from '@/domain/facility';

/** AI Facility Copilot — reads across every facility signal (alarms, generators,
 *  inventory, contracts, permits, incidents) and fuses them into one ranked list
 *  of actionable priorities, plus a real AI conversation. Actions
 *  fire the real facility mutations (dispatch WO, refuel, receive stock, ack). */
export default async function CopilotPage() {
  const { actor } = await requireCapability('assets_ppm', 'read', 'facility');
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
  const tenantId = actor.tenantId!;
  let usage: CopilotUsage | null = null;
  try {
    const ledgerTenantId = reviewModeEnabled() && isReviewActor(actor) ? reviewLedgerTenantId() ?? tenantId : tenantId;
    usage = await readCopilotLedgerUsage(ledgerTenantId);
  } catch { /* An unavailable durable meter is shown explicitly, never as zero usage. */ }

  return (
    <div className="pb-page">
      <CopilotWorkspace
        world={world}
        userName={userName}
        model={getTenantModel(tenantId)}
        usage={usage}
        canConfigure={can(actor, 'reports_analytics', 'update').allowed}
        canCreate={can(actor, 'assets_ppm', 'create').allowed}
        canUpdate={can(actor, 'assets_ppm', 'update').allowed}
      />
    </div>
  );
}
