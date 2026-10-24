import { requireCapability } from '@/server/guard';
import { can } from '@/lib/authz';
import { repos } from '@/server/data';
import { bookingMachine } from '@/domain/workflows';
import { legalEvents } from '@/lib/legal-events';
import { PageHeader } from '@/components/ui/page-header';
import { ScopeBanner } from '@/components/domain';
import { BookingsWorkspace, type BookingView } from '@/components/bookings/bookings-workspace';
import { withDurableRead } from '@/server/data/durable-records';

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
    id: b.id,
    amenity: b.amenity,
    residentName: b.residentName,
    status: b.status,
    slot: b.slot,
    feeMinor: b.fee ? b.fee.minor : null,
    feeCurrency: b.fee?.currency,
    actions: legalEvents(bookingMachine, b.status, actor),
  }));

  return (
    <div className="pb-page">
      <PageHeader title="Bookings" subtitle="Availability, utilisation, conflict detection and auto-approval — over the §10 booking machine"
        scope={<ScopeBanner label={actor.allEstates ? 'all estates' : `${actor.estateIds.length} estate(s)`} />}
      />
      <BookingsWorkspace bookings={bookings} canMutate={canMutate} />
    </div>
  );
  });
}
