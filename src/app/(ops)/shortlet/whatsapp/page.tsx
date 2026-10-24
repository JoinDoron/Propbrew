import { can } from '@/lib/authz';
import { PageHeader } from '@/components/ui/page-header';
import { requireCapability } from '@/server/guard';
import { repos } from '@/server/data';
import { operatingClock } from '@/server/operating-clock';
import { DEFAULT_TEMPLATES, renderTemplate, messageSchedule, whatsappStats } from '@/domain/shortlet';
import { WhatsappWorkspace, type TimelineRow } from '@/components/shortlet/whatsapp-workspace';
import { shortletDate, shortletMoney } from '@/components/shortlet/shortlet-format';
import { withDurableRead } from '@/server/data/durable-records';

const TEMPLATE_BY_KEY = new Map(DEFAULT_TEMPLATES.map((t) => [t.key, t.body]));

/** FR-WA (Short-Let PMS, Starter tier+) — WhatsApp automation. Templated guest
 *  messages (confirmation, pre-arrival, checkout, review) with a per-booking
 *  send schedule and status, plus delivery analytics. Advisory content; sent via
 *  the WhatsApp Business API from the operator's number. */
export default async function ShortletWhatsappPage() {
  return withDurableRead(async () => {
  const { nowMs: NOW_MS } = operatingClock();
  const { actor } = await requireCapability('bookings_amenities', 'read', 'shortlet');
  const bookings = repos.shortletBookings.list(actor).items;
  const apts = new Map(repos.shortletApartments.list(actor).items.map((a) => [a.id, a]));
  const props = new Map(repos.shortletProperties.list(actor).items.map((p) => [p.id, p.name]));

  // Timeline for the active/upcoming bookings (most relevant to message).
  const relevant = bookings.filter((b) => !['closed', 'cancelled'].includes(b.status));
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
        checkin: shortletDate(sample.checkIn), checkout: shortletDate(sample.checkOut), nights: String(sample.nights),
        wifi: sampleApt ? `${sampleApt.wifiSsid} · ${sampleApt.wifiPassword}` : '', access: sampleApt?.accessInstructions ?? '',
        balance: shortletMoney(sample.total.minor - sample.paid.minor), link: `stay.vesta.ng/g/${sample.id.slice(-8)}`, host: props.get(sample.propertyId) ?? 'Your host',
      }
    : {};

  return (
    <div className="pb-page">
      <PageHeader title="Guest messaging" subtitle="Review guest messages, templates and delivery activity." />
      <WhatsappWorkspace canUpdate={can(actor, 'bookings_amenities', 'update').allowed} stats={whatsappStats(bookings, NOW_MS)} templates={DEFAULT_TEMPLATES} sampleVars={sampleVars} timeline={timeline} />
    </div>
  );
  });
}
