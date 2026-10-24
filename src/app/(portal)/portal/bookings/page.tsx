import { PageHeader } from '@/components/ui/page-header';
import { requireCapability } from '@/server/guard';
import { can } from '@/lib/authz';
import { repos } from '@/server/data';
import { bookingMachine } from '@/domain/workflows';
import { legalEvents } from '@/lib/legal-events';
import { BookingsWorkspace, type BookingView } from '@/components/portal/bookings-workspace';
import { withDurableRead } from '@/server/data/durable-records';

/** EM-05 (resident view, §7 O) — my amenity bookings. A resident books from a
 *  day/time picker; the amenity's auto-approval rule decides instant vs
 *  manager-approved (advisory rules from the bookings engine). Upcoming and past
 *  are split; cancel drives the §10 machine; rebook re-opens the picker. */
export default async function MyBookingsPage() {
  return withDurableRead(async () => {
  const { actor } = await requireCapability('bookings_amenities');
  const bookings: BookingView[] = repos.bookings.list(actor).items.map((b) => ({
    id: b.id,
    amenity: b.amenity,
    status: b.status,
    slot: b.slot,
    feeMinor: b.fee ? b.fee.minor : null,
    feeCurrency: b.fee?.currency ?? null,
    actions: can(actor, 'bookings_amenities', 'transition').allowed ? legalEvents(bookingMachine, b.status, actor) : [],
  }));

  return (
    <div className="pb-page">
      <PageHeader title="My bookings" subtitle="Reserve shared amenities and track your bookings." />
      <div className="w-full min-w-0 flex flex-col gap-6">
      <BookingsWorkspace bookings={bookings} canCreate={can(actor, 'bookings_amenities', 'create').allowed} canTransition={can(actor, 'bookings_amenities', 'transition').allowed} />
      </div>
    </div>
  );
  });
}
