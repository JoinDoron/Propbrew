import { requireCapability } from '@/server/guard';
import { repos } from '@/server/data';
import { SafetyWorkspace, type SosRow } from '@/components/portal/safety-workspace';

/** EM-06 / EM-02 (resident view, §7 O) — Safety & SOS. A panic-countdown SOS
 *  (cancellable) starts the §10 flow; visitor passes generate a time-bound gate
 *  code; emergency contacts are one-tap callable; safety tips rotate. History is
 *  the resident's own events. */
export default async function ResidentSecurityPage() {
  const { actor } = await requireCapability('security_sos');
  const events: SosRow[] = repos.sosEvents.list(actor).items.map((s) => ({
    id: s.id, ref: s.ref, status: s.status, ackSeconds: s.ackSeconds, responder: s.responder, channel: s.channel,
  }));

  return (
    <div className="max-w-[560px] mx-auto">
      <SafetyWorkspace events={events} />
    </div>
  );
}
