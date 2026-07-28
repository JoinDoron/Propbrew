import { requireCapability } from '@/server/guard';
import { effectiveLevel } from '@/lib/authz';
import { repos } from '@/server/data';
import { sosEventMachine } from '@/domain/workflows';
import { legalEvents } from '@/lib/legal-events';
import { CardHeader } from '@/components/ui';
import { ScopeBanner } from '@/components/domain';
import { SosConsole, type SosView } from '@/components/security/sos-console';

/** EM-06 — Security & SOS live console. Active alerts show a live acknowledge
 *  timer against the sub-60-second target; the incident register, response-SLA,
 *  visitor passes and patrol log round out the desk. Actions are the §10 SOS
 *  machine, scoped and gated; no AI ever drives an SOS. */
export default async function SecurityPage() {
  const { actor } = await requireCapability('security_sos');
  const canMutate = ['F', 'M'].includes(effectiveLevel(actor, 'security_sos'));

  const events: SosView[] = repos.sosEvents.list(actor).items.map((s) => ({
    id: s.id,
    ref: s.ref,
    residentName: s.residentName,
    unitId: String(s.unitId),
    estateId: String(s.estateId),
    status: s.status,
    ackSeconds: s.ackSeconds,
    responder: s.responder,
    channel: s.channel,
    raisedAt: s.raisedAt,
    actions: legalEvents(sosEventMachine, s.status, actor).map((e) => e.event),
  }));

  return (
    <div className="max-w-[1200px] mx-auto flex flex-col gap-3.5">
      <ScopeBanner label={actor.allEstates ? 'all estates' : `${actor.estateIds.length} estate(s)`} />
      <CardHeader title="Security & SOS" subtitle="Live incident desk — sub-60s acknowledge, patrols, visitor access" />
      <SosConsole events={events} canMutate={canMutate} />
    </div>
  );
}
