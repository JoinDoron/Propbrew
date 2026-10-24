import type { Invoice, Resident, Site, Unit, WorkOrder } from '@/domain/entities';
import type { CurrencyCode } from '@/domain/primitives';

export type EstateOverviewInput = {
  /** Callers must supply actor-scoped records; this function is not an auth gate. */
  sites: readonly Site[];
  units: readonly Unit[];
  residents: readonly Resident[];
  invoices: readonly Invoice[];
  workOrders: readonly WorkOrder[];
  currency: CurrencyCode;
  now: string;
};

export type CollectionSummary = {
  billedMinor: number;
  collectedMinor: number;
  outstandingMinor: number;
  collectionRatePct: number | null;
  invoiceCount: number;
  settledInvoices: number;
  /** Balance-settled invoices, not a payment-gateway success rate. */
  settledInvoicePct: number | null;
};

export type EstateOverview = {
  currency: CurrencyCode;
  asOfLagosDate: string | null;
  propertiesCount: number;
  /** Counts refer to enumerated unit records, never Site.unitCount estimates. */
  units: { total: number; occupied: number; vacant: number; reserved: number; unavailable: number; occupancyPct: number | null };
  residents: { activeCount: number; overdueCount: number };
  collections: CollectionSummary;
  /** Current applied payments grouped by invoice due month; not cash-flow history. */
  collectionTrend: { month: string; label: string; billedMinor: number; collectedMinor: number }[];
  paymentsDue: {
    id: string;
    ref: string;
    estateId: string;
    residentName: string;
    description: string;
    dueDate: string;
    outstandingMinor: number;
    daysUntilDue: number;
    overdue: boolean;
  }[];
  propertyPerformance: ({ id: string; name: string; unitCount: number; occupiedUnits: number; occupancyPct: number | null } & CollectionSummary)[];
  maintenance: {
    /** Excludes cancelled/rejected work from completion-rate denominator. */
    total: number;
    open: number;
    inProgress: number;
    awaitingConfirmation: number;
    resolved: number;
    cancelled: number;
    rejected: number;
    resolutionRatePct: number | null;
    /** No resolvedAt field exists, so deriving a duration would be invented. */
    averageResolutionHours: null;
  };
};

type CalendarDate = { date: string; year: number; month: number; dayIndex: number };
type AppliedInvoice = { invoice: Invoice; amountMinor: number; paidMinor: number; outstandingMinor: number; due: CalendarDate | null };

const DAY_MS = 86_400_000;
const LAGOS_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit' });
const MONTH_LABEL = new Intl.DateTimeFormat('en-NG', { timeZone: 'UTC', month: 'short', year: 'numeric' });

function plainDate(value: string): CalendarDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1000 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const timestamp = Date.UTC(year, month - 1, day);
  const parsed = new Date(timestamp);
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return null;
  return { date: value, year, month, dayIndex: timestamp / DAY_MS };
}

/** Date-only values are Lagos dates. Timestamps need an explicit timezone. */
function lagosDate(value: string): CalendarDate | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return plainDate(value);
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match || !plainDate(match[1]) || Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4] ?? 0) > 59) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  const parts = LAGOS_DATE.formatToParts(new Date(timestamp));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '';
  return plainDate(`${part('year')}-${part('month')}-${part('day')}`);
}

// Use both columns when joining: matching a property ID alone must not attach
// another tenant's records if a caller accidentally includes extra rows.
const rowKey = (tenantId: string, id: string) => JSON.stringify([tenantId, id]);
const percentage = (value: number, total: number) => total > 0 ? Math.round(value / total * 100) : null;

function uniqueRows<T extends { tenantId: string; id: string }>(rows: readonly T[]): T[] {
  const result = new Map<string, T>();
  for (const row of rows) {
    const key = rowKey(row.tenantId, row.id);
    if (!result.has(key)) result.set(key, row);
  }
  return [...result.values()];
}

function summariseInvoices(rows: readonly AppliedInvoice[]): CollectionSummary {
  let billedMinor = 0;
  let collectedMinor = 0;
  let settledInvoices = 0;
  for (const row of rows) {
    billedMinor += row.amountMinor;
    collectedMinor += row.paidMinor;
    if (row.outstandingMinor === 0) settledInvoices++;
  }
  return {
    billedMinor,
    collectedMinor,
    outstandingMinor: billedMinor - collectedMinor,
    collectionRatePct: percentage(collectedMinor, billedMinor),
    invoiceCount: rows.length,
    settledInvoices,
    settledInvoicePct: percentage(settledInvoices, rows.length),
  };
}

/** Pure estate-only aggregation over an already-authorised record snapshot. */
export function buildEstateOverview(input: EstateOverviewInput): EstateOverview {
  const now = lagosDate(input.now);
  const sites = uniqueRows(input.sites.filter((site) => site.kind === 'estate'));
  const estateKeys = new Set(sites.map((site) => rowKey(site.tenantId, site.id)));
  const isEstateRecord = (tenantId: string, estateId: string) => estateKeys.has(rowKey(tenantId, estateId));
  const units = uniqueRows(input.units.filter((unit) => isEstateRecord(unit.tenantId, unit.siteId)));
  const residents = uniqueRows(input.residents.filter((resident) => resident.status === 'active' && isEstateRecord(resident.tenantId, resident.siteId)));
  const activeUsers = new Set(residents.map((resident) => rowKey(resident.tenantId, resident.userId)));
  const invoices: AppliedInvoice[] = [];

  for (const invoice of uniqueRows(input.invoices)) {
    if (!isEstateRecord(invoice.tenantId, invoice.estateId) || invoice.status === 'draft' || invoice.amount.currency !== input.currency || invoice.paid.currency !== input.currency) continue;
    if (!Number.isSafeInteger(invoice.amount.minor) || invoice.amount.minor < 0 || !Number.isSafeInteger(invoice.paid.minor)) continue;
    const paidMinor = Math.min(invoice.amount.minor, Math.max(0, invoice.paid.minor));
    invoices.push({ invoice, amountMinor: invoice.amount.minor, paidMinor, outstandingMinor: invoice.amount.minor - paidMinor, due: lagosDate(invoice.dueDate) });
  }

  const overdueUsers = new Set(invoices.filter((row) => now !== null && row.due !== null && row.due.dayIndex < now.dayIndex && row.outstandingMinor > 0).map(({ invoice }) => rowKey(invoice.tenantId, invoice.ownerUserId)).filter((key) => activeUsers.has(key)));
  const occupied = units.filter((unit) => unit.occupancy === 'occupied').length;

  const collectionTrend: EstateOverview['collectionTrend'] = [];
  if (now) {
    for (let offset = 5; offset >= 0; offset--) {
      const monthStart = new Date(Date.UTC(now.year, now.month - 1 - offset, 1));
      const month = `${monthStart.getUTCFullYear()}-${String(monthStart.getUTCMonth() + 1).padStart(2, '0')}`;
      const rows = invoices.filter((row) => row.due !== null && row.due.date.startsWith(month) && row.due.dayIndex <= now.dayIndex);
      const summary = summariseInvoices(rows);
      collectionTrend.push({ month, label: MONTH_LABEL.format(monthStart), billedMinor: summary.billedMinor, collectedMinor: summary.collectedMinor });
    }
  }

  const paymentsDue: EstateOverview['paymentsDue'] = [];
  if (now) {
    for (const row of invoices) {
      if (!row.due || row.outstandingMinor <= 0) continue;
      const daysUntilDue = row.due.dayIndex - now.dayIndex;
      if (daysUntilDue > 30) continue;
      paymentsDue.push({ id: row.invoice.id, ref: row.invoice.ref, estateId: row.invoice.estateId, residentName: row.invoice.residentName, description: row.invoice.description, dueDate: row.due.date, outstandingMinor: row.outstandingMinor, daysUntilDue, overdue: daysUntilDue < 0 });
    }
    paymentsDue.sort((a, b) => a.daysUntilDue - b.daysUntilDue || a.ref.localeCompare(b.ref) || a.id.localeCompare(b.id));
  }

  const propertyPerformance = sites.map((site) => {
    const siteUnits = units.filter((unit) => unit.tenantId === site.tenantId && unit.siteId === site.id);
    const occupiedUnits = siteUnits.filter((unit) => unit.occupancy === 'occupied').length;
    const siteInvoices = invoices.filter(({ invoice }) => invoice.tenantId === site.tenantId && invoice.estateId === site.id);
    return { id: String(site.id), name: site.name, unitCount: siteUnits.length, occupiedUnits, occupancyPct: percentage(occupiedUnits, siteUnits.length), ...summariseInvoices(siteInvoices) };
  });

  const maintenance: EstateOverview['maintenance'] = { total: 0, open: 0, inProgress: 0, awaitingConfirmation: 0, resolved: 0, cancelled: 0, rejected: 0, resolutionRatePct: null, averageResolutionHours: null };
  for (const workOrder of uniqueRows(input.workOrders).filter((row) => isEstateRecord(row.tenantId, row.estateId))) {
    switch (workOrder.status) {
      case 'new': case 'triaged': case 'assigned': maintenance.open++; break;
      case 'in_progress': case 'on_hold': maintenance.inProgress++; break;
      case 'resolved': maintenance.awaitingConfirmation++; break;
      case 'verified': case 'closed': maintenance.resolved++; break;
      case 'cancelled': maintenance.cancelled++; break;
      case 'rejected': maintenance.rejected++; break;
    }
  }
  maintenance.total = maintenance.open + maintenance.inProgress + maintenance.awaitingConfirmation + maintenance.resolved;
  maintenance.resolutionRatePct = percentage(maintenance.resolved, maintenance.total);

  return {
    currency: input.currency,
    asOfLagosDate: now?.date ?? null,
    propertiesCount: sites.length,
    units: { total: units.length, occupied, vacant: units.filter((unit) => unit.occupancy === 'vacant').length, reserved: units.filter((unit) => unit.occupancy === 'reserved').length, unavailable: units.filter((unit) => unit.occupancy === 'unavailable').length, occupancyPct: percentage(occupied, units.length) },
    residents: { activeCount: activeUsers.size, overdueCount: overdueUsers.size },
    collections: summariseInvoices(invoices),
    collectionTrend,
    paymentsDue,
    propertyPerformance,
    maintenance,
  };
}
