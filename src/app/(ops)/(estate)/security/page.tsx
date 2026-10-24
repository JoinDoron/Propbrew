import { requireCapability } from '@/server/guard';
import { effectiveLevel } from '@/lib/authz';
import { repos } from '@/server/data';
import { sosEventMachine } from '@/domain/workflows';
import { legalEvents } from '@/lib/legal-events';
import { PageHeader } from '@/components/ui/page-header';
import { ScopeBanner } from '@/components/domain';
import { SosConsole, type SosView } from '@/components/security/sos-console';

/** EM-06 — Security & SOS incident console. Alert age uses the recorded raised
 *  time against the sub-60-second target. Actions are the scoped §10 SOS machine,
 *  not a dispatch integration; visitor passes and patrols are labelled previews.
 *  No AI ever drives an SOS. */
export default async function SecurityPage() {
  const { actor } = await requireCapability('security_sos', 'read', 'estate');
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
    <div className="pb-page">
      <PageHeader title="Security & SOS" subtitle="Incident response, acknowledgement performance and visitor access previews."
        scope={<ScopeBanner label={actor.allEstates ? 'all estates' : `${actor.estateIds.length} estate(s)`} />}
      />
      <SosConsole events={events} canMutate={canMutate} />
    </div>
  );
}
