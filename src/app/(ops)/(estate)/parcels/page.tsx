import { operatingClock } from '@/server/operating-clock';
import { estateTargetOptions } from '@/server/reads/estate-target-options';
import { PageHeader } from '@/components/ui/page-header';
import { requireCapability } from '@/server/guard';
import { can } from '@/lib/authz';
import { repos } from '@/server/data';

import { parcelStats, lockerUtilization } from '@/domain/estate';
import { ParcelsWorkspace, type LockerCell, type ParcelRow } from '@/components/estate/parcels-workspace';
import { withDurableRead } from '@/server/data/durable-records';

/** Parcels & Lockers — the smart parcel room: locker banks, incoming parcels with
 *  auto-assigned lockers + pickup codes, overdue-pickup flags, and collect/notify.
 *  Gated by security_sos (front desk / security run it). */
export default async function ParcelsPage() {
  return withDurableRead(async () => {
  const { actor } = await requireCapability('security_sos', 'read', 'estate');
  const clock = operatingClock();
  const lockers = repos.lockers.list(actor).items;
  const parcels = repos.parcels.list(actor).items;

  const lockerCells: LockerCell[] = lockers.map((l) => ({ id: l.id, bank: l.bank, label: l.label, size: l.size, occupied: !!l.parcelId }));
  const parcelRows: ParcelRow[] = parcels.map((p) => ({ id: p.id, code: p.code, residentName: p.residentName, unitLabel: p.unitLabel, courier: p.courier, size: p.size, status: p.status, lockerLabel: p.lockerLabel, receivedISO: p.receivedISO }));
  const stats = parcelStats(parcels, clock.nowMs);

  return (
    <div className="pb-page">
      <PageHeader title="Parcels &amp; lockers" subtitle="Track incoming deliveries and resident collections." />
      <ParcelsWorkspace estates={can(actor, 'security_sos', 'create').allowed ? estateTargetOptions(actor, 'security_sos', 'create') : []}
        lockers={lockerCells}
        parcels={parcelRows}
        kpis={{ ...stats, util: lockerUtilization(lockers) }}
        nowMs={clock.nowMs}
        canCreate={can(actor, 'security_sos', 'create').allowed}
        canMutate={can(actor, 'security_sos', 'update').allowed}
      />
    </div>
  );
  });
}
