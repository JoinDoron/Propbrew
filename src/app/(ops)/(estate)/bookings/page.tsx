import { requireCapability } from '@/server/guard';
import { can, assertCan, matchesScope } from '@/lib/authz';
import { repos } from '@/server/data';
import { bookingMachine } from '@/domain/workflows';
import { legalEvents } from '@/lib/legal-events';
import { PageHeader } from '@/components/ui/page-header';
import { ScopeBanner } from '@/components/domain';
import { BookingsWorkspace, type BookingView } from '@/components/bookings/bookings-workspace';
import { withDurableRead } from '@/server/data/durable-records';
import { estateAmenitiesFor } from '@/server/estate/amenities';
import { db } from '@/server/data/store';
import { nativeAuthEnabled } from '@/server/auth/mode';

/** EM-05 — amenity bookings. An availability heatmap, per-amenity utilisation,
 *  auto-approval rule hints, conflict detection and an approval queue sit over
 *  the §10 booking machine (Requested → Approved/Auto-approved → Confirmed →
 *  Completed). Rules are advisory — a manual amenity always needs manager
 *  sign-off; fees clear via SC-02 on confirmation. Scoped (§8.2). */
export default async function BookingsPage() {
  return withDurableRead(async () => {
  const { actor } = await requireCapability('bookings_amenities', 'read', 'estate');
  const canMutate = can(actor, 'bookings_amenities', 'transition').allowed;

  const bookings: BookingView[] = repos.bookings.list(actor).items.map((b) => ({
    id: b.id, amenityId: b.amenityId, endISO: b.endISO, estateId: b.estateId,
    amenity: b.amenity,
    residentName: b.residentName,
    status: b.status,
    slot: b.slot,
    feeMinor: b.fee ? b.fee.minor : null,
    feeCurrency: b.fee?.currency,
    actions: legalEvents(bookingMachine, b.status, actor),
  }));

  const native = nativeAuthEnabled();
  const scope = assertCan(actor, 'bookings_amenities', 'read');
  const sites = native ? db.sites.filter((site) => site.kind === 'estate' && matchesScope({ ...site, siteId: site.id }, scope)).map((site) => ({ id: String(site.id), name: site.name })) : [];
  const residents = native && canMutate ? db.residents.filter((resident) => matchesScope({ ...resident, ownerUserId: resident.userId }, scope) && ['active', 'invited'].includes(resident.status)).map((resident) => ({ id: String(resident.id), name: resident.name, siteId: String(resident.siteId), unitId: String(resident.unitId), unitLabel: db.units.find((unit) => unit.tenantId === actor.tenantId && unit.id === resident.unitId)?.label ?? 'Recorded unit' })) : [];

  return (
    <div className="pb-page">
      <PageHeader title="Bookings" subtitle="Manage shared spaces, resident reservations and approvals."
        scope={<ScopeBanner label={actor.allEstates ? 'all estates' : `${actor.estateIds.length} estate(s)`} />}
      />
      <BookingsWorkspace bookings={bookings} canMutate={canMutate} amenities={native ? estateAmenitiesFor(actor, true) : undefined} sites={sites} residents={residents} expectedCompanyId={actor.tenantId ?? ''} />
    </div>
  );
  });
}
