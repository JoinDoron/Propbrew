import { PageHeader } from '@/components/ui/page-header';
import { requireCapability } from '@/server/guard';
import { can, type Role } from '@/lib/authz';
import { repos } from '@/server/data';
import { shortletBookingMachine } from '@/domain/workflows';
import { outstandingMinor } from '@/domain/shortlet';
import { BookingsWorkspace, type BookingRow, type AptOption } from '@/components/shortlet/bookings-workspace';

const ACTION_LABEL: Record<string, string> = { CONFIRM: 'Confirm', CHECK_IN: 'Check in', CHECK_OUT: 'Check out', CANCEL: 'Cancel' };

/** FR-BM / FR-RC (Short-Let PMS) — bookings: create, drive the §10 machine
 *  (confirm → check-in → check-out → close via inspection), record off-platform
 *  payments, and generate the personalised guest link + a professional receipt. */
export default async function ShortletBookingsPage() {
  const { actor } = await requireCapability('bookings_amenities', 'read', 'shortlet');
  const roles = actor.roles as Role[];
  const canTransition = can(actor, 'bookings_amenities', 'transition').allowed;
  const apts = repos.shortletApartments.list(actor).items;
  const props = repos.shortletProperties.list(actor).items;
  const bookings = repos.shortletBookings.list(actor).items;

  const aptById = new Map(apts.map((a) => [a.id, a]));
  const propById = new Map(props.map((p) => [p.id, p]));
  const phoneCounts = new Map<string, number>();
  for (const b of bookings) phoneCounts.set(b.guestPhone, (phoneCounts.get(b.guestPhone) ?? 0) + 1);

  const rows: BookingRow[] = bookings.map((b) => {
    const apt = aptById.get(b.apartmentId);
    const prop = propById.get(b.propertyId);
    const actions = canTransition
      ? Array.from(new Set(shortletBookingMachine.transitions.filter((t) => t.from === b.status && t.actors.some((a) => roles.includes(a as Role)) && ACTION_LABEL[t.event]).map((t) => t.event))).map((e) => ({ event: e, label: ACTION_LABEL[e] }))
      : [];
    return {
      id: b.id, ref: b.ref, guest: b.guestName, phone: b.guestPhone, apt: apt?.name ?? '', property: prop?.name ?? '', propertyId: b.propertyId,
      checkIn: b.checkIn, checkOut: b.checkOut, nights: b.nights, source: b.source, status: b.status,
      totalMinor: b.total.minor, paidMinor: b.paid.minor, outstandingMinor: outstandingMinor(b), nightlyMinor: b.nightlyRate.minor,
      cautionFeeMinor: b.cautionFee.minor, cautionStatus: b.cautionStatus, cautionDeductedMinor: b.cautionDeducted.minor,
      wifiSsid: apt?.wifiSsid ?? '', wifiPassword: apt?.wifiPassword ?? '', access: apt?.accessInstructions ?? '', houseRules: apt?.houseRules ?? [],
      repeat: (phoneCounts.get(b.guestPhone) ?? 0) > 1,
      bank: { name: prop?.bankName ?? '', account: prop?.accountName ?? '', number: prop?.accountNumber ?? '' },
      actions,
    };
  });

  const aptOptions: AptOption[] = apts.filter((a) => a.status === 'active' && a.nightlyRate.currency === 'NGN').map((a) => ({ id: a.id, name: a.name, property: propById.get(a.propertyId)?.name ?? '', rateMinor: a.nightlyRate.minor }));

  return (
    <div className="pb-page">
      <PageHeader title="Bookings" subtitle="Manage enquiries, stays, payments and guest receipts." />
      <BookingsWorkspace canCreate={can(actor, 'bookings_amenities', 'create').allowed} canUpdate={can(actor, 'bookings_amenities', 'update').allowed} bookings={rows} apartments={aptOptions} />
    </div>
  );
}
