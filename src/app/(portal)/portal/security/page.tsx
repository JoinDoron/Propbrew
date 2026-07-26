import { requireCapability } from '@/server/guard';
import { repos } from '@/server/data';
import { Button, Card, CardHeader, Mono, Table, Td, Th, TableRow } from '@/components/ui';
import { DomainStatus } from '@/components/domain';
import { LifeBuoy, QrCode } from 'lucide-react';

/** EM-06 / EM-02 (resident view) — Safety & SOS + visitor passes, scoped to the
 *  resident's own records (§7 O). The SOS button is the entry to the §10 SOS
 *  flow; the visitor pass generates a time-bound code verified by Security. */
export default async function ResidentSecurityPage() {
  const { actor } = await requireCapability('security_sos');
  const myEvents = repos.sosEvents.list(actor).items;

  return (
    <div className="max-w-[900px] mx-auto flex flex-col gap-3.5">
      <Card className="!bg-[color:var(--tone-danger)]/[0.06] border-[color:var(--tone-danger)]/40">
        <div className="flex items-center gap-4">
          <span className="w-12 h-12 rounded-2xl bg-[color:var(--tone-danger)] text-white flex items-center justify-center flex-none">
            <LifeBuoy size={24} />
          </span>
          <div className="flex-1">
            <h3 className="text-[15px] font-semibold">Emergency SOS</h3>
            <p className="text-[12.5px] text-text-2">Alerts the security desk and responders with your unit and location.</p>
          </div>
          <Button variant="primary" className="!bg-[color:var(--tone-danger)] !h-11 !px-5">Raise SOS</Button>
        </div>
      </Card>

      <div className="flex items-center justify-between">
        <div />
        <Button variant="secondary" icon={<QrCode size={16} />}>New visitor pass</Button>
      </div>

      <Card padded={false}>
        <div className="p-4 sm:p-[18px] pb-0">
          <CardHeader title="My SOS history" subtitle="Alerts you have raised, and how they were handled" />
        </div>
        {myEvents.length === 0 ? (
          <p className="p-6 text-center text-[13px] text-text-3">No SOS alerts — stay safe.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Ref</Th>
                <Th>Status</Th>
                <Th className="max-[560px]:hidden">Acknowledged</Th>
                <Th>Responder</Th>
              </tr>
            </thead>
            <tbody>
              {myEvents.map((s) => (
                <TableRow key={s.id}>
                  <Td><Mono className="font-semibold text-[13px]">{s.ref}</Mono></Td>
                  <Td><DomainStatus type="sos" status={s.status} /></Td>
                  <Td className="max-[560px]:hidden text-[12.5px] font-mono">{s.ackSeconds === null ? 'pending' : `${s.ackSeconds}s`}</Td>
                  <Td className="text-[13px] text-text-2">{s.responder ?? '—'}</Td>
                </TableRow>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
