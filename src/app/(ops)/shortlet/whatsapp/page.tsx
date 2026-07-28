import { requireCapability } from '@/server/guard';
import { repos } from '@/server/data';
import { NOW_MS } from '@/domain/ppm';
import { DEFAULT_TEMPLATES, renderTemplate, messageSchedule, whatsappStats } from '@/domain/shortlet';
import { WhatsappWorkspace, type TimelineRow } from '@/components/shortlet/whatsapp-workspace';

const TEMPLATE_BY_KEY = new Map(DEFAULT_TEMPLATES.map((t) => [t.key, t.body]));

/** FR-WA (Short-Let PMS, Starter tier+) — WhatsApp automation. Templated guest
 *  messages (confirmation, pre-arrival, checkout, review) with a per-booking
 *  send schedule and status, plus delivery analytics. Advisory content; sent via
 *  the WhatsApp Business API from the operator's number. */
export default async function ShortletWhatsappPage() {
  const { actor } = await requireCapability('bookings_amenities');
  const bookings = repos.shortletBookings.list(actor).items;
  const apts = new Map(repos.shortletApartments.list(actor).items.map((a) => [a.id, a]));
  const props = new Map(repos.shortletProperties.list(actor).items.map((p) => [p.id, p.name]));

  // Timeline for the active/upcoming bookings (most relevant to message).
  const relevant = bookings.filter((b) => !['closed', 'cancelled'].includes(b.status)).slice(0, 12);
  const timeline: TimelineRow[] = relevant.map((b) => {
    const apt = apts.get(b.apartmentId);
    return {
      id: b.id, ref: b.ref, guest: b.guestName, apt: apt?.name ?? '',
      messages: messageSchedule(b, NOW_MS).map((m) => ({ key: m.key, label: m.label, whenISO: m.whenISO, status: m.status, preview: renderTemplate(TEMPLATE_BY_KEY.get(m.key) ?? '', b, apt) })),
    };
  });

  // Sample vars for the live template preview (first relevant booking).
  const sample = relevant[0];
  const sampleApt = sample ? apts.get(sample.apartmentId) : undefined;
  const sampleVars: Record<string, string> = sample
    ? {
        guest: sample.guestName.split(' ')[0], apartment: sampleApt?.name ?? '', property: props.get(sample.propertyId) ?? '',
        checkin: sample.checkIn.slice(5), checkout: sample.checkOut.slice(5), nights: String(sample.nights),
        wifi: sampleApt ? `${sampleApt.wifiSsid} · ${sampleApt.wifiPassword}` : '', access: sampleApt?.accessInstructions ?? '',
        balance: `₦${((sample.total.minor - sample.paid.minor) / 100).toLocaleString('en-NG')}`, link: `stay.vesta.ng/g/${sample.id.slice(-8)}`, host: 'Marina Suites',
      }
    : {};

  return (
    <div className="max-w-[1000px] mx-auto">
      <WhatsappWorkspace stats={whatsappStats(bookings, NOW_MS)} templates={DEFAULT_TEMPLATES} sampleVars={sampleVars} timeline={timeline} />
    </div>
  );
}
