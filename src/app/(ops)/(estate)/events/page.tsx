import { operatingClock } from '@/server/operating-clock';
import { estateTargetOptions } from '@/server/reads/estate-target-options';
import { PageHeader } from '@/components/ui/page-header';
import { requireCapability } from '@/server/guard';
import { can } from '@/lib/authz';
import { repos } from '@/server/data';

import { eventState, isEventFull, amenityLoad } from '@/domain/estate';
import { EventsWorkspace, type EventRow, type AmenityRow } from '@/components/estate/events-workspace';
import { withDurableRead } from '@/server/data/durable-records';

/** Events & Amenities — the community programme: an events calendar with RSVP +
 *  capacity, amenity-demand ranking, and event creation. Gated by
 *  bookings_amenities (the estate manager programmes the estate). */
export default async function EventsPage() {
  return withDurableRead(async () => {
  const { actor } = await requireCapability('bookings_amenities', 'read', 'estate');
  const clock = operatingClock();
  const events = repos.communityEvents.list(actor).items;

  const upcoming = events.filter((e) => !e.cancelled && Date.parse(e.endISO) >= clock.nowMs);
  const load = amenityLoad(events, clock.nowMs);
  const rows: EventRow[] = events.map((e) => ({ id: e.id, title: e.title, category: e.category, venue: e.venue, host: e.host, startISO: e.startISO, endISO: e.endISO, capacity: e.capacity, rsvps: e.rsvps, cancelled: e.cancelled }));
  const amenities: AmenityRow[] = load;

  return (
    <div className="pb-page">
      <PageHeader title="Events &amp; amenities" subtitle="Plan community events and manage participation." />
      <EventsWorkspace estates={can(actor, 'bookings_amenities', 'create').allowed ? estateTargetOptions(actor, 'bookings_amenities', 'create') : []}
        events={rows}
        amenities={amenities}
        kpis={{
          upcoming: upcoming.length,
          totalRsvps: upcoming.reduce((n, e) => n + e.rsvps, 0),
          full: upcoming.filter((e) => isEventFull(e) && eventState(e, clock.nowMs) !== 'past').length,
          topVenue: load[0]?.venue ?? '—',
        }}
        nowMs={clock.nowMs}
        canMutate={can(actor, 'bookings_amenities', 'update').allowed}
        canCreate={can(actor, 'bookings_amenities', 'create').allowed}
      />
    </div>
  );
  });
}
