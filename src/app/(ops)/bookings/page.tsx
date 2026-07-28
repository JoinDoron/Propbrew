import { requireCapability } from '@/server/guard';
import { effectiveLevel } from '@/lib/authz';
import { repos } from '@/server/data';
import { bookingMachine } from '@/domain/workflows';
import { legalEvents } from '@/lib/legal-events';
import { CardHeader } from '@/components/ui';
import { ScopeBanner } from '@/components/domain';
import { BookingsWorkspace, type BookingView } from '@/components/bookings/bookings-workspace';

/** EM-05 — amenity bookings. An availability heatmap, per-amenity utilisation,
 *  auto-approval rule hints, conflict detection and an approval queue sit over
 *  the §10 booking machine (Requested → Approved/Auto-approved → Confirmed →
 *  Completed). Rules are advisory — a manual amenity always needs manager
 *  sign-off; fees clear via SC-02 on confirmation. Scoped (§8.2). */
export default async function BookingsPage() {
  const { actor } = await requireCapability('bookings_amenities');
  const canMutate = ['F', 'M'].includes(effectiveLevel(actor, 'bookings_amenities'));

  const bookings: BookingView[] = repos.bookings.list(actor).items.map((b) => ({
    id: b.id,
    amenity: b.amenity,
    residentName: b.residentName,
    status: b.status,
    slot: b.slot,
    feeMinor: b.fee ? b.fee.minor : null,
    actions: legalEvents(bookingMachine, b.status, actor),
  }));

  return (
    <div className="max-w-[1200px] mx-auto flex flex-col gap-3.5">
      <ScopeBanner label={actor.allEstates ? 'all estates' : `${actor.estateIds.length} estate(s)`} />
      <CardHeader title="Bookings" subtitle="Availability, utilisation, conflict detection and auto-approval — over the §10 booking machine" />
      <BookingsWorkspace bookings={bookings} canMutate={canMutate} />
    </div>
  );
}
