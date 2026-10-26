import { can } from '@/lib/authz';
import { PageHeader } from '@/components/ui/page-header';
import { OperationsControlWorkspace } from '@/components/shortlet/operations-control-workspace';
import { requireCapability } from '@/server/guard';
import { repos } from '@/server/data';
import { withDurableRead } from '@/server/data/durable-records';
import { shortletControl } from '@/server/shortlet-control';

export default async function ShortletOperationsPage() {
  return withDurableRead(async () => {
    const { actor } = await requireCapability('bookings_amenities', 'read', 'shortlet');
    const tenantId = actor.tenantId!;
    const control = shortletControl(tenantId);
    const apartments = new Map(repos.shortletApartments.list(actor, { limit: Number.MAX_SAFE_INTEGER }).items.map((row) => [row.id, row.name]));
    const bookingRecords = repos.shortletBookings.list(actor, { limit: Number.MAX_SAFE_INTEGER }).items;
    const bookingMap = new Map(bookingRecords.map((row) => [row.id, row]));
    const bookings = bookingRecords.map((booking) => {
      const readiness = control.guestReadiness.find((row) => row.bookingId === booking.id);
      return { id: booking.id, ref: booking.ref, guest: booking.guestName, apt: apartments.get(booking.apartmentId) ?? 'Apartment not linked', status: booking.status, totalMinor: booking.total.minor, paidMinor: booking.paid.minor, cautionMinor: booking.cautionFee.minor, readiness: readiness ? { id: readiness.id, status: readiness.status, documentType: readiness.documentType, documentLast4: readiness.documentLast4, consentAtISO: readiness.consentAtISO } : undefined };
    });
    const transactions = control.transactions.map((row) => { const booking = bookingMap.get(row.bookingId); return { id: row.id, bookingId: row.bookingId, ref: booking?.ref ?? 'Booking not linked', guest: booking?.guestName ?? 'Guest not linked', kind: row.kind, amountMinor: row.amountMinor, method: row.method, reference: row.reference, status: row.status, requestedAtISO: row.requestedAtISO }; });
    const turnovers = control.turnovers.map((row) => { const booking = bookingMap.get(row.bookingId); return { id: row.id, bookingId: row.bookingId, ref: booking?.ref ?? 'Booking not linked', apt: apartments.get(row.apartmentId) ?? 'Apartment not linked', dueAtISO: row.dueAtISO, assigneeId: row.assigneeId, assigneeName: row.assigneeName, status: row.status, checklist: row.checklist, maintenanceIssues: row.maintenanceIssueIds.length }; });
    const members = repos.shortletTeam.list(actor, { limit: Number.MAX_SAFE_INTEGER }).items.filter((row) => ['housekeeper', 'manager'].includes(row.role)).map((row) => ({ id: row.id, name: row.name, role: row.role }));
    const approvals = control.approvals.map((row) => ({ id: row.id, kind: row.kind, title: row.title, summary: row.summary, status: row.status, requestedAtISO: row.requestedAtISO }));
    return <div className="pb-page"><PageHeader title="Shortlet operations" subtitle="Guest readiness, finance controls, turnovers and approvals in one operating queue." /><OperationsControlWorkspace bookings={bookings} transactions={transactions} turnovers={turnovers} members={members} approvals={approvals} canCreate={can(actor, 'bookings_amenities', 'create').allowed} canUpdate={can(actor, 'bookings_amenities', 'update').allowed} /></div>;
  });
}
