import type { DunningStage, PromiseStatus } from '@/domain/estate';
import type { CollectionInvoiceReview } from '@/domain/estate/collection-review';

export type CaseRow = {
  id: string;
  invoiceRef: string;
  residentName: string;
  unitLabel: string;
  amountMinor: number;
  agingDays: number;
  stage: DunningStage;
  remindersSent: number;
  promiseAmountMinor?: number;
  promiseDueISO?: string;
  promiseStatus?: PromiseStatus;
  invoiceReview?: CollectionInvoiceReview;
};

// Collection cases currently store NGN minor units, unlike multi-currency invoices.
export const collectionMoney = (minor: number) => new Intl.NumberFormat('en-NG', {
  style: 'currency', currency: 'NGN', minimumFractionDigits: 0, maximumFractionDigits: 2,
}).format(minor / 100);

export function collectionDate(value: string) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat('en-NG', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date);
}
