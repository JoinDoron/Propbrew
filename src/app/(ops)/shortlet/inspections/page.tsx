import { requireCapability } from '@/server/guard';
import { repos } from '@/server/data';
import { InspectionsWorkspace, type PendingRow, type DoneRow } from '@/components/shortlet/inspections-workspace';

/** FR-CI (Short-Let PMS) — checkout inspections. A checked-out booking is
 *  inspected against a structured checklist; the outcome drives the caution-fee
 *  decision (refund / deduct / forfeit) and closes the booking. Completed
 *  inspections are permanent dispute evidence (NFR-04), downloadable as a pack. */
export default async function ShortletInspectionsPage() {
  const { actor } = await requireCapability('bookings_amenities');
  const bookings = repos.shortletBookings.list(actor).items;
  const apts = new Map(repos.shortletApartments.list(actor).items.map((a) => [a.id, a]));
  const props = new Map(repos.shortletProperties.list(actor).items.map((p) => [p.id, p.name]));
  const inspections = repos.shortletInspections.list(actor).items;
  const inspected = new Set(inspections.map((i) => i.bookingId));

  const pending: PendingRow[] = bookings
    .filter((b) => b.status === 'checked_out' && !inspected.has(b.id))
    .map((b) => ({ id: b.id, ref: b.ref, guest: b.guestName, apt: apts.get(b.apartmentId)?.name ?? '', property: props.get(b.propertyId) ?? '', cautionFeeMinor: b.cautionFee.minor }));

  const bookingById = new Map(bookings.map((b) => [b.id, b]));
  const done: DoneRow[] = inspections.map((i) => {
    const b = bookingById.get(i.bookingId);
    return {
      bookingId: i.bookingId, ref: b?.ref ?? '', guest: b?.guestName ?? '', apt: apts.get(i.apartmentId)?.name ?? '', at: i.at,
      outcome: i.outcome, damageMinor: i.damageTotal.minor, cautionFeeMinor: b?.cautionFee.minor ?? 0, cautionStatus: b?.cautionStatus ?? 'pending',
      items: i.items.map((it) => ({ label: it.label, condition: it.condition, note: it.note, chargeMinor: it.chargeMinor })),
    };
  });

  return (
    <div className="max-w-[820px] mx-auto">
      <InspectionsWorkspace pending={pending} done={done} />
    </div>
  );
}
