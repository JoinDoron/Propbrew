import { durableRecordsEnabled } from '@/server/data/record-context';
import { requireCapability } from '@/server/guard';
import { can, effectiveLevel } from '@/lib/authz';
import { repos } from '@/server/data';
import type { Page } from '@/domain/primitives';
import { PageHeader } from '@/components/ui/page-header';
import { ScopeBanner, formatMoney } from '@/components/domain';
import { ResidentsExplorer } from '@/components/people/residents-explorer';
import { EstateCreateActions } from '@/components/workspaces/estate-create-actions';
import { canRegisterEstateRecords } from '@/server/data/estate-creation-scope';
import { devIdentityEnabled } from '@/server/session';
import { requireOperatorSession } from '@/server/workspaces';
import { NOW } from '@/domain/ppm';
import { isReviewActor, reviewModeEnabled } from '@/server/review-auth';
import { withDurableRead } from '@/server/data/durable-records';
import { nativeEstateCreationReady } from '@/server/data/company-estate-access';
import { residentInvoiceBalances } from '@/domain/estate/invoice-balances';
import { money } from '@/domain/primitives';

function allRows<T>(read: (cursor?: string | null) => Page<T>): T[] {
  const rows: T[] = [];
  let cursor: string | null | undefined;
  do {
    const page = read(cursor);
    rows.push(...page.items);
    cursor = page.cursor;
  } while (cursor !== null);
  return rows;
}

const keyFor = (tenantId: string, id: string) => JSON.stringify([tenantId, id]);

/** EM-02 — residents & visitor management. Interactive directory: pick a resident
 *  to see their unit, bills, requests and bookings in one profile. Each linked
 *  section is fetched only if the viewer's role may read it (§7), so the profile
 *  adapts to the viewer. */
export default async function PeoplePage() {
  return withDurableRead(async () => {
  const { actor } = await requireCapability('users_roles', 'read', 'estate');
  const canMutate = ['F', 'M'].includes(effectiveLevel(actor, 'users_roles'));
  const residents = allRows((cursor) => repos.residents.list(actor, { cursor, limit: 200 }));

  const seesBills = can(actor, 'charges_invoicing', 'read').allowed;
  const seesRequests = can(actor, 'work_orders', 'read').allowed;
  const seesBookings = can(actor, 'bookings_amenities', 'read').allowed;
  const seesSpaces = can(actor, 'assets_ppm', 'read').allowed;

  const invoiceRecords = seesBills ? allRows((cursor) => repos.invoices.list(actor, { cursor, limit: 200 })) : [];
  const bills = seesBills
    ? invoiceRecords.map((i) => ({ id: i.id, ref: i.ref, ownerUserId: i.ownerUserId, unitId: i.unitId, status: i.status, amountLabel: formatMoney(i.amount), dueDate: i.dueDate }))
    : [];
  const requests = seesRequests
    ? allRows((cursor) => repos.workOrders.list(actor, { cursor, limit: 200 })).map((w) => ({ id: w.id, ref: w.ref, requesterUserId: w.requesterUserId, unitId: w.unitId, title: w.title, status: w.status }))
    : [];
  const bookings = seesBookings
    ? allRows((cursor) => repos.bookings.list(actor, { cursor, limit: 200 })).map((b) => ({ id: b.id, ownerUserId: b.ownerUserId, amenity: b.amenity, status: b.status, slot: b.slot }))
    : [];

  const sites = seesSpaces ? allRows((cursor) => repos.sites.list(actor, { cursor, limit: 200 })) : [];
  const siteIds = new Set(sites.map((site) => keyFor(site.tenantId, site.id)));
  const units = seesSpaces ? allRows((cursor) => repos.units.list(actor, { cursor, limit: 200 })).filter((unit) => siteIds.has(keyFor(unit.tenantId, unit.siteId))) : [];
  const unitById = new Map(units.map((unit) => [keyFor(unit.tenantId, unit.id), unit]));
  const native = nativeEstateCreationReady(actor);
  const canAddTenant = canRegisterEstateRecords(actor) && (!actor.companyAccess || native);
  const session = canAddTenant ? await requireOperatorSession() : null;
  const review = session?.key === 'private-review' && reviewModeEnabled() && isReviewActor(actor);
  const demo = Boolean(review || session && session.key !== 'clerk' && devIdentityEnabled());
  const persistent = durableRecordsEnabled();
  const localDemo = review || demo && process.env.NODE_ENV !== 'production' && (!process.env.DATA_SOURCE || process.env.DATA_SOURCE === 'memory');
  const now = demo ? new Date(`${NOW}T09:00:00Z`) : new Date();
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const datePart = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  const availableUnits = canAddTenant ? units.filter((unit) => unit.occupancy === 'vacant'
    && sites.some((site) => site.kind === 'estate' && site.id === unit.siteId && site.tenantId === unit.tenantId)
    && !residents.some((resident) => resident.tenantId === unit.tenantId && resident.unitId === unit.id && ['active', 'invited'].includes(resident.status)))
    .map((unit) => ({ id: String(unit.id), label: unit.label, propertyName: sites.find((site) => site.id === unit.siteId && site.tenantId === unit.tenantId)?.name ?? 'Property' })) : [];

  const rows = residents.map((r) => {
    const unit = unitById.get(keyFor(r.tenantId, r.unitId));
    const ledger = actor.companyAccess && seesBills ? residentInvoiceBalances(invoiceRecords, r.tenantId, r.userId, r.unitId) : null;
    const currentBalances = ledger?.balances.length ? ledger.balances : [money(0, r.balance.currency)];
    return {
      id: r.id,
      userId: r.userId,
      name: r.name,
      email: r.email,
      phone: r.phone,
      unitId: r.unitId,
      unitLabel: unit?.label ?? r.unitId,
      unitType: unit?.type ?? '',
      status: r.status,
      household: r.household,
      balanceLabel: !seesBills ? '—' : ledger ? ledger.invalid ? 'Balance requires review' : currentBalances.map(formatMoney).join(' · ') : formatMoney(r.balance),
      balanceOwed: seesBills && (ledger ? ledger.invalid > 0 || currentBalances.some((value) => value.minor > 0) : r.balance.minor > 0),
      moveInDate: r.moveInDate,
    };
  });

  return (
    <div className="pb-page">
      <PageHeader title="Residents" subtitle="The people, households and tenancies across your estate."
        scope={<ScopeBanner label={actor.allEstates ? 'all estates' : `${actor.estateIds.length} estate(s)`} />}
        actions={canAddTenant ? <EstateCreateActions canAddProperty={false} canAddTenant units={availableUnits}
          persistent={persistent} demo={localDemo} native={native} asOfDate={`${datePart('year')}-${datePart('month')}-${datePart('day')}`} /> : undefined}
      />
      <ResidentsExplorer
        residents={rows}
        bills={bills}
        requests={requests}
        bookings={bookings}
        seesBills={seesBills}
        seesRequests={seesRequests}
        seesBookings={seesBookings}
        canMutate={canMutate}
        canEditRecords={native && canMutate}
        units={units.map((unit) => ({ id: String(unit.id), occupancy: unit.occupancy, label: `${sites.find((site) => site.id === unit.siteId)?.name ?? 'Property'} · ${unit.label}` }))}
      />
    </div>
  );
  });
}
