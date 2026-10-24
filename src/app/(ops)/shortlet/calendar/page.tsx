import { PageHeader } from '@/components/ui/page-header';
import { requireCapability } from '@/server/guard';
import { repos } from '@/server/data';
import { NOW_MS } from '@/domain/ppm';
import { CalendarWorkspace, type CalBooking, type CalApt } from '@/components/shortlet/calendar-workspace';

/** FR-BM-04 (Short-Let PMS) — the multi-unit availability calendar. Week / 2-week
 *  / Month views, prev-next navigation, an apartment filter, a legend,
 *  same-day-turnover flags, and outbound .ics export. */
export default async function ShortletCalendarPage() {
  const { actor } = await requireCapability('bookings_amenities', 'read', 'shortlet');
  const apts = repos.shortletApartments.list(actor).items;
  const props = new Map(repos.shortletProperties.list(actor).items.map((p) => [p.id, p.name]));

  const apartments: CalApt[] = apts.map((a) => ({ id: a.id, name: a.name, property: props.get(a.propertyId) ?? '' }));
  const bookings: CalBooking[] = repos.shortletBookings.list(actor).items.map((b) => ({ id: b.id, apartmentId: b.apartmentId, ref: b.ref, guestName: b.guestName, status: b.status, checkIn: b.checkIn, checkOut: b.checkOut, source: b.source }));

  return (
    <div className="pb-page">
      <PageHeader title="Availability calendar" subtitle="See upcoming stays and coordinate apartment turnovers." />
      <CalendarWorkspace apartments={apartments} bookings={bookings} nowMs={NOW_MS} />
    </div>
  );
}
