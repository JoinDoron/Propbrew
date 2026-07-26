import { requireCapability } from '@/server/guard';
import { repos } from '@/server/data';
import { sosEventMachine } from '@/domain/workflows';
import { legalEvents } from '@/lib/legal-events';
import { Card, CardHeader, KpiCard, Mono, Table, Td, Th, TableRow } from '@/components/ui';
import { DomainStatus, ScopeBanner } from '@/components/domain';
import { InlineActions } from '@/components/inline-actions';
import { ShieldAlert, ShieldCheck, Timer } from 'lucide-react';

/** EM-06 — Security & SOS console. Acknowledge time is measured against the
 *  sub-60-second target (§10); a raised, unacknowledged event is the highest-
 *  salience row on the board. */
export default async function SecurityPage() {
  const { actor } = await requireCapability('security_sos');
  const rows = repos.sosEvents.list(actor).items;

  const active = rows.filter((s) => s.status !== 'reviewed');
  const raised = rows.filter((s) => s.status === 'raised').length;
  const acked = rows.filter((s) => s.ackSeconds !== null);
  const avgAck = acked.length ? Math.round(acked.reduce((a, s) => a + (s.ackSeconds ?? 0), 0) / acked.length) : 0;

  return (
    <div className="max-w-[1200px] mx-auto flex flex-col gap-3.5">
      <ScopeBanner label={actor.allEstates ? 'all estates' : `${actor.estateIds.length} estate(s)`} />

      <div className="grid grid-cols-1 min-[560px]:grid-cols-3 gap-3.5">
        <KpiCard label="Active alerts" value={String(active.length)} delta={raised > 0 ? `${raised} unacknowledged` : 'all acknowledged'} positive={raised === 0} icon={<ShieldAlert size={18} />} iconBg="rgba(239,68,68,.12)" iconColor="#ef4444" />
        <KpiCard label="Avg acknowledge" value={`${avgAck}s`} delta={avgAck <= 60 ? 'within 60s target' : 'over target'} positive={avgAck <= 60} icon={<Timer size={18} />} iconBg="rgba(245,159,11,.15)" iconColor="#f59e0b" />
        <KpiCard label="Resolved today" value={String(rows.filter((s) => ['resolved', 'reviewed'].includes(s.status)).length)} icon={<ShieldCheck size={18} />} iconBg="rgba(16,185,129,.12)" iconColor="#10b981" />
      </div>

      <Card padded={false}>
        <div className="p-4 sm:p-[18px] pb-0">
          <CardHeader title="SOS events" subtitle="Live alerts, acknowledge times and responders" />
        </div>
        <Table>
          <thead>
            <tr>
              <Th>Ref</Th>
              <Th>Resident · Unit</Th>
              <Th>Status</Th>
              <Th className="max-[560px]:hidden">Ack</Th>
              <Th className="max-[720px]:hidden">Responder</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <TableRow key={s.id}>
                <Td><Mono className="font-semibold text-[13px]">{s.ref}</Mono></Td>
                <Td>
                  <div className="text-[13px] font-medium">{s.residentName}</div>
                  <div className="text-[11.5px] text-text-3 font-mono">{s.unitId}</div>
                </Td>
                <Td><DomainStatus type="sos" status={s.status} /></Td>
                <Td className="max-[560px]:hidden">
                  {s.ackSeconds === null ? (
                    <span className="text-[12.5px] text-negative font-semibold">pending</span>
                  ) : (
                    <span className={`font-mono text-[12.5px] ${s.ackSeconds <= 60 ? 'text-positive' : 'text-warning'}`}>{s.ackSeconds}s</span>
                  )}
                </Td>
                <Td className="max-[720px]:hidden text-[13px] text-text-2">{s.responder ?? '—'}</Td>
                <Td className="text-right">
                  <InlineActions machineKey="sos-event" id={s.id} events={legalEvents(sosEventMachine, s.status, actor)} />
                </Td>
              </TableRow>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
