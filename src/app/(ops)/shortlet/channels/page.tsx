import { can } from '@/lib/authz';
import { PageHeader } from '@/components/ui/page-header';
import { requireCapability } from '@/server/guard';
import { repos } from '@/server/data';
import { channelSummary, detectConflicts, outboundFeedUrl } from '@/domain/shortlet';
import { ChannelsWorkspace, type AptRow, type ConflictRow, type ChannelKey } from '@/components/shortlet/channels-workspace';
import { shortletDate } from '@/components/shortlet/shortlet-format';

/** FR-IC (Short-Let PMS, Growth tier+) — iCal channel sync. Connect per-apartment
 *  Airbnb / Booking.com / Google feeds; external bookings block availability. A
 *  double-booking guard detects overlapping stays (the residual risk iCal polling
 *  latency creates), and each apartment exposes an outbound iCal feed. */
export default async function ShortletChannelsPage() {
  const { actor } = await requireCapability('bookings_amenities', 'read', 'shortlet');
  const apts = repos.shortletApartments.list(actor).items;
  const props = new Map(repos.shortletProperties.list(actor).items.map((p) => [p.id, p.name]));
  const bookings = repos.shortletBookings.list(actor).items;
  const aptName = new Map(apts.map((a) => [a.id, a.name]));

  const apartments: AptRow[] = apts.map((a) => ({ id: a.id, name: a.name, property: props.get(a.propertyId) ?? '', channels: a.channels as ChannelKey[], feedUrl: outboundFeedUrl(a.id) }));

  const conflicts: ConflictRow[] = detectConflicts(bookings).map((c) => ({
    apt: aptName.get(c.apartmentId) ?? '', guestA: c.a.guestName, guestB: c.b.guestName,
    rangeA: `${shortletDate(c.a.checkIn)} → ${shortletDate(c.a.checkOut)}`, rangeB: `${shortletDate(c.b.checkIn)} → ${shortletDate(c.b.checkOut)}`, nights: c.nights,
  }));

  return (
    <div className="pb-page">
      <PageHeader title="Channel management" subtitle="Manage apartment connections and review overlapping stays." />
      <ChannelsWorkspace canUpdate={can(actor, 'bookings_amenities', 'update').allowed} apartments={apartments} summary={channelSummary(apts)} conflicts={conflicts} lastSync="No verified provider sync" />
    </div>
  );
}
