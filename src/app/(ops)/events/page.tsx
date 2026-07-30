import { requireCapability } from '@/server/guard';
import { repos } from '@/server/data';
import { NOW_MS } from '@/domain/ppm';
import { eventState, isEventFull, amenityLoad } from '@/domain/estate';
import { EventsWorkspace, type EventRow, type AmenityRow } from '@/components/estate/events-workspace';

/** Events & Amenities — the community programme: an events calendar with RSVP +
 *  capacity, amenity-demand ranking, and event creation. Gated by
 *  bookings_amenities (the estate manager programmes the estate). */
export default async function EventsPage() {
  const { actor } = await requireCapability('bookings_amenities');
  const events = repos.communityEvents.list(actor).items;

  const upcoming = events.filter((e) => !e.cancelled && Date.parse(e.endISO) >= NOW_MS);
  const load = amenityLoad(events, NOW_MS);
  const rows: EventRow[] = events.map((e) => ({ id: e.id, title: e.title, category: e.category, venue: e.venue, host: e.host, startISO: e.startISO, endISO: e.endISO, capacity: e.capacity, rsvps: e.rsvps, cancelled: e.cancelled }));
  const amenities: AmenityRow[] = load;

  return (
    <div className="max-w-[1000px] mx-auto">
      <EventsWorkspace
        events={rows}
        amenities={amenities}
        kpis={{
          upcoming: upcoming.length,
          totalRsvps: upcoming.reduce((n, e) => n + e.rsvps, 0),
          full: upcoming.filter((e) => isEventFull(e) && eventState(e, NOW_MS) !== 'past').length,
          topVenue: load[0]?.venue ?? '—',
        }}
        nowMs={NOW_MS}
      />
    </div>
  );
}
