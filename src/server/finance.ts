import 'server-only';

import type { Actor } from '@/lib/authz';
import { can } from '@/lib/authz';
import { canUseCompanyModule } from '@/lib/auth/company-policy';
import { buildFinanceSnapshot, type FinanceLedgerRow, type FinanceSnapshot } from '@/domain/finance/control';
import { repos } from '@/server/data';
import { operatingClock } from '@/server/operating-clock';
import { constructionControl } from '@/server/construction-control';
import { shortletControl } from '@/server/shortlet-control';
import { financeControl } from '@/server/finance-control';

const ngn = (money: { currency: string; minor: number } | null | undefined) => money?.currency === 'NGN' && Number.isSafeInteger(money.minor) ? money.minor : 0;
const dateOnly = (value: string) => value.slice(0, 10);
const addDays = (value: string, days: number) => new Date(Date.parse(`${dateOnly(value)}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

export function financeSnapshot(actor: Actor): FinanceSnapshot {
  if (!actor.tenantId) throw new Error('Company context required.');
  const todayISO = operatingClock().dateISO;
  const moduleRead = {
    estate: canUseCompanyModule(actor, 'estate', 'read'),
    facility: canUseCompanyModule(actor, 'facility', 'read'),
    shortlet: canUseCompanyModule(actor, 'shortlet', 'read'),
    construction: canUseCompanyModule(actor, 'construction', 'read'),
  };
  const invoices = moduleRead.estate && can(actor, 'charges_invoicing', 'read').allowed ? repos.invoices.list(actor, { limit: 5000 }).items : [];
  const workOrders = moduleRead.facility && can(actor, 'work_orders', 'read').allowed ? repos.workOrders.list(actor, { limit: 5000 }).items : [];
  const shortletBookings = moduleRead.shortlet && can(actor, 'bookings_amenities', 'read').allowed ? repos.shortletBookings.list(actor, { limit: 5000 }).items : [];
  const shortletExpenses = moduleRead.shortlet && can(actor, 'bookings_amenities', 'read').allowed ? repos.shortletExpenses.list(actor, { limit: 5000 }).items : [];
  const shortletState = shortletControl(actor.tenantId);
  const construction = constructionControl(actor.tenantId);
  const control = financeControl(actor.tenantId);

  const estateReceivables: FinanceLedgerRow[] = invoices.filter((row) => row.amount.currency === 'NGN' && row.paid.currency === 'NGN').map((row) => ({
    id: row.id, ref: row.ref, module: 'estate', counterparty: row.residentName, description: row.description,
    dateISO: row.dueDate, dueDateISO: row.dueDate, grossMinor: row.amount.minor, paidMinor: row.paid.minor,
    outstandingMinor: Math.max(0, row.amount.minor - row.paid.minor), status: row.status, kind: 'receivable', source: 'Estate invoice ledger',
  }));
  const shortletReceivables: FinanceLedgerRow[] = shortletBookings.filter((row) => row.total.currency === 'NGN' && row.paid.currency === 'NGN' && row.status !== 'cancelled').map((row) => ({
    id: row.id, ref: row.ref, module: 'shortlet', counterparty: row.guestName, description: `Accommodation · ${row.nights} night${row.nights === 1 ? '' : 's'}`,
    dateISO: row.createdAt.slice(0, 10), dueDateISO: row.checkIn, grossMinor: row.total.minor, paidMinor: row.paid.minor,
    outstandingMinor: Math.max(0, row.total.minor - row.paid.minor), status: row.status, kind: 'receivable', source: 'Shortlet booking ledger',
  }));
  const manualPayables: FinanceLedgerRow[] = control.payables.filter((row) => moduleRead[row.module]).map((row) => ({
    id: row.id, ref: row.ref, module: row.module, counterparty: row.counterparty, description: row.description,
    dateISO: row.invoiceDateISO, dueDateISO: row.dueDateISO, grossMinor: row.grossMinor,
    paidMinor: row.status === 'paid' ? row.netPayableMinor : 0, outstandingMinor: row.status === 'paid' ? 0 : row.netPayableMinor,
    status: row.status, kind: 'payable', whtMinor: row.whtMinor, source: `Finance control · ${row.sourceRef}`,
  }));
  const constructionPayables: FinanceLedgerRow[] = (moduleRead.construction ? construction.payments : []).map((row) => ({
    id: row.id, ref: row.ref, module: 'construction', counterparty: row.invoiceRef, description: `Procurement payment · ${row.invoiceRef}`,
    dateISO: dateOnly(row.requestedAtISO), dueDateISO: addDays(row.requestedAtISO, 30), grossMinor: row.invoiceMinor,
    paidMinor: row.status === 'paid' ? row.payableMinor : 0, outstandingMinor: row.status === 'paid' ? 0 : row.payableMinor,
    status: row.status, kind: 'payable', whtMinor: row.whtMinor, source: 'Construction procurement control',
  }));
  const claimPayables: FinanceLedgerRow[] = (moduleRead.construction ? construction.claims : []).filter((row) => ['approved', 'paid'].includes(row.status) && row.certifiedMinor !== undefined).map((row) => ({
    id: row.id, ref: row.ref, module: 'construction', counterparty: row.subcontractorId, description: row.description,
    dateISO: row.periodEndISO, dueDateISO: addDays(row.periodEndISO, 30), grossMinor: row.assessedMinor ?? row.claimedMinor,
    paidMinor: row.status === 'paid' ? row.certifiedMinor! : 0, outstandingMinor: row.status === 'paid' ? 0 : row.certifiedMinor!,
    status: row.status, kind: 'payable', whtMinor: row.whtMinor, source: 'Construction certified claim',
  }));
  const approvedShortletInflows = (moduleRead.shortlet ? shortletState.transactions : []).filter((row) => ['approved', 'completed'].includes(row.status) && ['accommodation_payment', 'caution_deposit'].includes(row.kind)).reduce((sum, row) => sum + row.amountMinor, 0);
  const shortletRefunds = (moduleRead.shortlet ? shortletState.transactions : []).filter((row) => ['approved', 'completed'].includes(row.status) && row.kind === 'refund').reduce((sum, row) => sum + row.amountMinor, 0);
  const paidConstruction = (moduleRead.construction ? construction.payments : []).filter((row) => row.status === 'paid').reduce((sum, row) => sum + row.payableMinor, 0)
    + (moduleRead.construction ? construction.claims : []).filter((row) => row.status === 'paid').reduce((sum, row) => sum + (row.certifiedMinor ?? 0), 0);
  const facilityActual = workOrders.filter((row) => row.status === 'closed').reduce((sum, row) => sum + ngn(row.cost), 0);
  const estateInflows = invoices.reduce((sum, row) => sum + ngn(row.paid), 0);
  const shortletInflow = Math.max(shortletBookings.reduce((sum, row) => sum + ngn(row.paid), 0), approvedShortletInflows);
  const shortletOutflow = shortletExpenses.reduce((sum, row) => sum + ngn(row.amount), 0) + shortletRefunds;
  const manualByModule = (module: 'estate' | 'facility' | 'shortlet' | 'construction') => moduleRead[module] ? control.payables.filter((row) => row.module === module && row.status === 'paid').reduce((sum, row) => sum + row.netPayableMinor, 0) : 0;
  return buildFinanceSnapshot({
    todayISO,
    receivables: [...estateReceivables, ...shortletReceivables],
    payables: [...manualPayables, ...constructionPayables, ...claimPayables],
    recordedInflows: { estate: estateInflows, facility: 0, shortlet: shortletInflow, construction: 0 },
    recordedOutflows: { estate: manualByModule('estate'), facility: facilityActual + manualByModule('facility'), shortlet: shortletOutflow + manualByModule('shortlet'), construction: paidConstruction + manualByModule('construction') },
  });
}
