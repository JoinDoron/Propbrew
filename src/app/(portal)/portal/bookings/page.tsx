import { requireCapability } from '@/server/guard';
import { repos } from '@/server/data';
import { bookingMachine } from '@/domain/workflows';
import { legalEvents } from '@/lib/legal-events';
import { BookingsWorkspace, type BookingView } from '@/components/portal/bookings-workspace';

/** EM-05 (resident view, §7 O) — my amenity bookings. A resident books from a
 *  day/time picker; the amenity's auto-approval rule decides instant vs
 *  manager-approved (advisory rules from the bookings engine). Upcoming and past
 *  are split; cancel drives the §10 machine; rebook re-opens the picker. */
export default async function MyBookingsPage() {
  const { actor } = await requireCapability('bookings_amenities');
  const bookings: BookingView[] = repos.bookings.list(actor).items.map((b) => ({
    id: b.id,
    amenity: b.amenity,
    status: b.status,
    slot: b.slot,
    feeMinor: b.fee ? b.fee.minor : null,
    actions: legalEvents(bookingMachine, b.status, actor),
  }));

  return (
    <div className="max-w-[720px] mx-auto">
      <BookingsWorkspace bookings={bookings} />
    </div>
  );
}
