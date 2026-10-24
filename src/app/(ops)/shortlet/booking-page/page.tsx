import { can } from '@/lib/authz';
import { PageHeader } from '@/components/ui/page-header';
import { requireCapability } from '@/server/guard';
import { repos } from '@/server/data';
import { db } from '@/server/data/store';
import { bookingPageFunnel, bookingPageByApartment } from '@/domain/shortlet';
import { BookingPageWorkspace, type AptFunnel, type PreviewApt } from '@/components/shortlet/booking-page-workspace';

/** Direct booking page (flow idea) — a public link where guests browse the
 *  operator's apartments and book direct (no OTA fees). Config (on/off, link,
 *  cancellation policy, hold window, promo codes) + a conversion funnel and
 *  per-apartment performance, with a live guest-facing preview. */
export default async function ShortletBookingPagePage() {
  const { actor } = await requireCapability('bookings_amenities', 'read', 'shortlet');
  const apts = repos.shortletApartments.list(actor).items;
  const props = new Map(repos.shortletProperties.list(actor).items.map((p) => [p.id, p.name]));
  const bookings = repos.shortletBookings.list(actor).items;
  const aptName = new Map(apts.map((a) => [a.id, a]));

  const funnel = bookingPageFunnel(bookings);
  const aptFunnels: AptFunnel[] = bookingPageByApartment(bookings)
    .map((f) => ({ name: aptName.get(f.apartmentId)?.name ?? '', rateMinor: aptName.get(f.apartmentId)?.nightlyRate.minor ?? 0, views: f.views, enquiries: f.enquiries, confirmed: f.confirmed, conversionPct: f.conversionPct }))
    .sort((a, b) => b.confirmed - a.confirmed);
  const preview: PreviewApt[] = apts.filter((a) => a.status === 'active').map((a) => ({ name: a.name, type: a.type, rateMinor: a.nightlyRate.minor, property: props.get(a.propertyId) ?? '' }));

  return (
    <div className="pb-page">
      <PageHeader title="Direct booking page" subtitle="Manage your guest-facing page, promotions and conversion performance." />
      <BookingPageWorkspace canUpdate={can(actor, 'bookings_amenities', 'update').allowed} config={db.shortletBookingPage} funnel={funnel} aptFunnels={aptFunnels} preview={preview} businessName="Marina Suites & Maitama Court" />
    </div>
  );
}
