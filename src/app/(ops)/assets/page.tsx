import { requireCapability } from '@/server/guard';
import { effectiveLevel } from '@/lib/authz';
import { repos } from '@/server/data';
import { Button, Card, CardHeader, StatusPill, Mono, Table, Td, Th, TableRow } from '@/components/ui';
import { ReadOnlyChip, ScopeBanner } from '@/components/domain';
import { humanizeStatus, type Tone } from '@/lib/status-tones';
import { Plus } from 'lucide-react';

const ASSET_TONE: Record<string, Tone> = {
  operational: 'success',
  degraded: 'warn',
  under_maintenance: 'info',
  out_of_service: 'danger',
  archived: 'muted',
};

/** FM-01 — asset register. Facility Manager can add (M); Executive/Technician are
 *  view-only (V). Assets are archived, never deleted. */
export default async function AssetsPage() {
  const { actor } = await requireCapability('assets_ppm');
  const canMutate = ['F', 'M'].includes(effectiveLevel(actor, 'assets_ppm'));
  const rows = repos.assets.list(actor).items;

  return (
    <div className="max-w-[1200px] mx-auto flex flex-col gap-3.5">
      <ScopeBanner label={actor.allEstates ? 'all estates' : `${actor.estateIds.length} estate(s)`} />
      <Card padded={false}>
        <div className="p-4 sm:p-[18px] pb-0">
          <CardHeader
            title={`${rows.length} assets`}
            subtitle="The register of everything under management"
            action={canMutate ? <Button variant="primary" icon={<Plus size={16} />}>Add asset</Button> : <ReadOnlyChip />}
          />
        </div>
        <Table>
          <thead>
            <tr>
              <Th>Asset</Th>
              <Th className="max-[720px]:hidden">Serial</Th>
              <Th>Location</Th>
              <Th>Status</Th>
              <Th className="max-[560px]:hidden">Warranty</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <TableRow key={a.id}>
                <Td>
                  <div className="text-[13px] font-medium">{a.name}</div>
                  <div className="text-[11.5px] text-text-3">{a.category}</div>
                </Td>
                <Td className="max-[720px]:hidden"><Mono className="text-[12px]">{a.serial}</Mono></Td>
                <Td className="text-[13px] text-text-2">{a.locationLabel}</Td>
                <Td><StatusPill status={humanizeStatus(a.status)} tone={ASSET_TONE[a.status] ?? 'neutral'} /></Td>
                <Td className="max-[560px]:hidden text-[12.5px] text-text-3 font-mono">{a.warrantyExpiry}</Td>
              </TableRow>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
