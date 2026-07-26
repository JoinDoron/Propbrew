import { requireCapability } from '@/server/guard';
import { effectiveLevel } from '@/lib/authz';
import { repos } from '@/server/data';
import { Button, Card, CardHeader, StatusPill, Mono, Table, Td, Th, TableRow, Avatar } from '@/components/ui';
import { Money, ReadOnlyChip, ScopeBanner } from '@/components/domain';
import { UserPlus } from 'lucide-react';
import type { Tone } from '@/lib/status-tones';

const RESIDENT_TONE: Record<string, Tone> = { active: 'success', invited: 'info', moved_out: 'muted' };

/** EM-02 — residents & visitor management. */
export default async function PeoplePage() {
  const { actor } = await requireCapability('users_roles');
  const canMutate = ['F', 'M'].includes(effectiveLevel(actor, 'users_roles'));
  const rows = repos.residents.list(actor).items;

  return (
    <div className="max-w-[1200px] mx-auto flex flex-col gap-3.5">
      <ScopeBanner label={actor.allEstates ? 'all estates' : `${actor.estateIds.length} estate(s)`} />
      <Card padded={false}>
        <div className="p-4 sm:p-[18px] pb-0">
          <CardHeader
            title={`${rows.length} residents`}
            subtitle="Who lives on the estate, and their units"
            action={canMutate ? <Button variant="primary" icon={<UserPlus size={16} />}>Invite resident</Button> : <ReadOnlyChip />}
          />
        </div>
        <Table>
          <thead>
            <tr>
              <Th>Resident</Th>
              <Th>Unit</Th>
              <Th>Status</Th>
              <Th className="max-[560px]:hidden">Household</Th>
              <Th className="text-right">Balance</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <Td>
                  <div className="flex items-center gap-2.5">
                    <Avatar name={r.name} size={30} />
                    <span className="text-[13px] font-medium">{r.name}</span>
                  </div>
                </Td>
                <Td><Mono className="text-[12.5px]">{r.unitId}</Mono></Td>
                <Td><StatusPill status={r.status.replace(/_/g, ' ')} tone={RESIDENT_TONE[r.status] ?? 'neutral'} /></Td>
                <Td className="max-[560px]:hidden text-[13px]">{r.household}</Td>
                <Td className="text-right"><Money value={r.balance} /></Td>
              </TableRow>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
