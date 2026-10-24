import { PageHeader } from '@/components/ui/page-header';
import { requireCapability } from '@/server/guard';
import { repos } from '@/server/data';
import { can } from '@/lib/authz';
import { SafetyWorkspace, type SosRow } from '@/components/portal/safety-workspace';
import { withDurableRead } from '@/server/data/durable-records';

/** EM-06 / EM-02 (resident view, §7 O) — Safety & SOS. A panic-countdown SOS
 *  (cancellable) starts the §10 flow; visitor passes generate a time-bound gate
 *  code; emergency contacts are one-tap callable; safety tips rotate. History is
 *  the resident's own events. */
export default async function ResidentSecurityPage() {
  return withDurableRead(async () => {
  const { actor } = await requireCapability('security_sos');
  const targetUnitId = actor.unitIds[0];
  const targetUnit = repos.units.list(actor).items.find((unit) => unit.id === targetUnitId);
  const events: SosRow[] = repos.sosEvents.list(actor).items.map((s) => ({
    id: s.id, ref: s.ref, status: s.status, ackSeconds: s.ackSeconds, responder: s.responder, channel: s.channel,
  }));

  return (
    <div className="pb-page">
      <PageHeader title="Safety & access" subtitle="Emergency support, visitor passes and your safety contacts." />
      <div className="w-full min-w-0 flex flex-col gap-6">
      <SafetyWorkspace events={events} canRaise={!!targetUnitId && can(actor, 'security_sos', 'create').allowed} targetUnitLabel={targetUnit ? `${targetUnit.label} · ${targetUnit.id}` : targetUnitId ?? 'No linked unit'} />
      </div>
    </div>
  );
  });
}
