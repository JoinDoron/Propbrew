export type FinanceModule = 'estate' | 'facility' | 'shortlet' | 'construction';
export type FinancePayableStatus = 'pending_approval' | 'approved' | 'paid' | 'rejected';

export type FinancePayable = {
  tenantId: string;
  id: string;
  ref: string;
  module: FinanceModule;
  counterparty: string;
  description: string;
  sourceRef: string;
  invoiceDateISO: string;
  dueDateISO: string;
  grossMinor: number;
  whtPct: number;
  whtMinor: number;
  netPayableMinor: number;
  status: FinancePayableStatus;
  requestedBy: string;
  requestedAtISO: string;
  reviewedBy?: string;
  reviewedAtISO?: string;
  reviewNote?: string;
  bankReference?: string;
  paidAtISO?: string;
};

export type WhtCertificate = {
  tenantId: string;
  id: string;
  ref: string;
  module: FinanceModule;
  sourceId: string;
  sourceRef: string;
  beneficiary: string;
  grossMinor: number;
  ratePct: number;
  amountMinor: number;
  periodISO: string;
  status: 'issued';
  issuedBy: string;
  issuedAtISO: string;
  externalCertificateRef?: string;
  remittanceRef?: string;
};

export type FinanceControlState = { payables: FinancePayable[]; whtCertificates: WhtCertificate[] };
export const emptyFinanceControlState = (): FinanceControlState => ({ payables: [], whtCertificates: [] });

export const payableDeductions = (grossMinor: number, whtPct: number) => {
  const whtMinor = Math.round(grossMinor * whtPct / 100);
  return { whtMinor, netPayableMinor: grossMinor - whtMinor };
};

export type FinanceLedgerRow = {
  id: string;
  ref: string;
  module: FinanceModule;
  counterparty: string;
  description: string;
  dateISO: string;
  dueDateISO: string;
  grossMinor: number;
  paidMinor: number;
  outstandingMinor: number;
  status: string;
  kind: 'receivable' | 'payable';
  whtMinor?: number;
  source: string;
};

export type FinanceCashBucket = { label: string; fromISO: string; toISO: string; inflowMinor: number; outflowMinor: number; netMinor: number };

export type FinanceSnapshot = {
  snapshotISO: string;
  receivables: FinanceLedgerRow[];
  payables: FinanceLedgerRow[];
  cashBuckets: FinanceCashBucket[];
  moduleSummary: Array<{ module: FinanceModule; receivableMinor: number; payableMinor: number; recordedInflowMinor: number; recordedOutflowMinor: number }>;
  totals: { receivableMinor: number; payableMinor: number; recordedInflowMinor: number; recordedOutflowMinor: number; netRecordedCashMinor: number; whtMinor: number; overdueReceivableMinor: number; overduePayableMinor: number };
  forecast: { baseClosingMinor: number; upsideClosingMinor: number; downsideClosingMinor: number; assumptions: string[] };
};

const day = 86_400_000;
const addDays = (iso: string, days: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + days * day).toISOString().slice(0, 10);

export function buildFinanceSnapshot(input: {
  todayISO: string;
  receivables: FinanceLedgerRow[];
  payables: FinanceLedgerRow[];
  recordedInflows: Partial<Record<FinanceModule, number>>;
  recordedOutflows: Partial<Record<FinanceModule, number>>;
}): FinanceSnapshot {
  const modules: FinanceModule[] = ['estate', 'facility', 'shortlet', 'construction'];
  const openReceivables = input.receivables.filter((row) => row.outstandingMinor > 0 && !['cancelled', 'void', 'draft'].includes(row.status));
  const openPayables = input.payables.filter((row) => row.outstandingMinor > 0 && !['rejected', 'paid'].includes(row.status));
  const sum = (rows: FinanceLedgerRow[], field: 'outstandingMinor' | 'whtMinor') => rows.reduce((total, row) => total + (row[field] ?? 0), 0);
  const buckets = [[0, 30], [31, 60], [61, 90]].map(([start, end]) => {
    const fromISO = addDays(input.todayISO, start); const toISO = addDays(input.todayISO, end);
    const due = (row: FinanceLedgerRow) => row.dueDateISO >= fromISO && row.dueDateISO <= toISO;
    const inflowMinor = openReceivables.filter(due).reduce((total, row) => total + row.outstandingMinor, 0);
    const outflowMinor = openPayables.filter(due).reduce((total, row) => total + row.outstandingMinor, 0);
    return { label: `${start || 1}–${end} days`, fromISO, toISO, inflowMinor, outflowMinor, netMinor: inflowMinor - outflowMinor };
  });
  const moduleSummary = modules.map((module) => ({
    module,
    receivableMinor: openReceivables.filter((row) => row.module === module).reduce((total, row) => total + row.outstandingMinor, 0),
    payableMinor: openPayables.filter((row) => row.module === module).reduce((total, row) => total + row.outstandingMinor, 0),
    recordedInflowMinor: input.recordedInflows[module] ?? 0,
    recordedOutflowMinor: input.recordedOutflows[module] ?? 0,
  }));
  const recordedInflowMinor = modules.reduce((total, module) => total + (input.recordedInflows[module] ?? 0), 0);
  const recordedOutflowMinor = modules.reduce((total, module) => total + (input.recordedOutflows[module] ?? 0), 0);
  const totals = {
    receivableMinor: sum(openReceivables, 'outstandingMinor'), payableMinor: sum(openPayables, 'outstandingMinor'), recordedInflowMinor, recordedOutflowMinor,
    netRecordedCashMinor: recordedInflowMinor - recordedOutflowMinor, whtMinor: sum(input.payables.filter((row) => row.status !== 'rejected'), 'whtMinor'),
    overdueReceivableMinor: openReceivables.filter((row) => row.dueDateISO < input.todayISO).reduce((total, row) => total + row.outstandingMinor, 0),
    overduePayableMinor: openPayables.filter((row) => row.dueDateISO < input.todayISO).reduce((total, row) => total + row.outstandingMinor, 0),
  };
  const scheduledNet = buckets.reduce((total, bucket) => total + bucket.netMinor, 0);
  return {
    snapshotISO: `${input.todayISO}T12:00:00+01:00`, receivables: openReceivables, payables: openPayables, cashBuckets: buckets, moduleSummary, totals,
    forecast: {
      baseClosingMinor: totals.netRecordedCashMinor + Math.round(scheduledNet * 0.72),
      upsideClosingMinor: totals.netRecordedCashMinor + Math.round(sum(openReceivables, 'outstandingMinor') * 0.9) - Math.round(sum(openPayables, 'outstandingMinor') * 0.95),
      downsideClosingMinor: totals.netRecordedCashMinor + Math.round(sum(openReceivables, 'outstandingMinor') * 0.45) - sum(openPayables, 'outstandingMinor'),
      assumptions: ['Base case collects 72% of scheduled net cash in the next 90 days.', 'Upside assumes 90% receivable recovery and 95% payable settlement.', 'Downside assumes 45% receivable recovery and full payable settlement.'],
    },
  };
}
