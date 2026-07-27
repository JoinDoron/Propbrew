import { requireCapability } from '@/server/guard';
import { can, effectiveLevel } from '@/lib/authz';
import { repos, seed } from '@/server/data';
import { CardHeader } from '@/components/ui';
import { ScopeBanner, formatMoney } from '@/components/domain';
import { ResidentsExplorer } from '@/components/people/residents-explorer';

/** EM-02 — residents & visitor management. Interactive directory: pick a resident
 *  to see their unit, bills, requests and bookings in one profile. Each linked
 *  section is fetched only if the viewer's role may read it (§7), so the profile
 *  adapts to the viewer. */
export default async function PeoplePage() {
  const { actor } = await requireCapability('users_roles');
  const canMutate = ['F', 'M'].includes(effectiveLevel(actor, 'users_roles'));
  const residents = repos.residents.list(actor).items;

  const seesBills = can(actor, 'charges_invoicing', 'read').allowed;
  const seesRequests = can(actor, 'work_orders', 'read').allowed;
  const seesBookings = can(actor, 'bookings_amenities', 'read').allowed;

  const bills = seesBills
    ? repos.invoices.list(actor).items.map((i) => ({ id: i.id, ref: i.ref, ownerUserId: i.ownerUserId, unitId: i.unitId, status: i.status, amountLabel: formatMoney(i.amount), dueDate: i.dueDate }))
    : [];
  const requests = seesRequests
    ? repos.workOrders.list(actor).items.map((w) => ({ id: w.id, ref: w.ref, requesterUserId: w.requesterUserId, unitId: w.unitId, title: w.title, status: w.status }))
    : [];
  const bookings = seesBookings
    ? repos.bookings.list(actor).items.map((b) => ({ id: b.id, ownerUserId: b.ownerUserId, amenity: b.amenity, status: b.status, slot: b.slot }))
    : [];

  const unitById = new Map(seed.units.map((u) => [u.id, u]));
  const emailByUser = new Map(seed.users.map((u) => [u.id, u.email]));

  const rows = residents.map((r) => {
    const unit = unitById.get(r.unitId);
    return {
      id: r.id,
      userId: r.userId,
      name: r.name,
      email: emailByUser.get(r.userId),
      unitId: r.unitId,
      unitLabel: unit?.label ?? r.unitId,
      unitType: unit?.type ?? '',
      status: r.status,
      household: r.household,
      balanceLabel: formatMoney(r.balance),
      balanceOwed: r.balance.minor > 0,
      moveInDate: r.moveInDate,
    };
  });

  return (
    <div className="max-w-[1200px] mx-auto flex flex-col gap-3.5">
      <ScopeBanner label={actor.allEstates ? 'all estates' : `${actor.estateIds.length} estate(s)`} />
      <CardHeader title={`${residents.length} residents`} subtitle="Who lives on the estate — filter, search and open a full profile" />
      <ResidentsExplorer
        residents={rows}
        bills={bills}
        requests={requests}
        bookings={bookings}
        seesBills={seesBills}
        seesRequests={seesRequests}
        seesBookings={seesBookings}
        canMutate={canMutate}
      />
    </div>
  );
}
