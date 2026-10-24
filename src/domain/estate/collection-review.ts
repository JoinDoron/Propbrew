import type { Invoice } from '@/domain/entities';
import type { CollectionCase } from './types';

export type CollectionInvoiceReview = {
  state: 'matched' | 'paid' | 'draft' | 'missing' | 'currency_mismatch' | 'balance_mismatch' | 'invalid_balance';
  label: string;
  detail: string;
  outstandingMinor: number | null;
  canFollowUp: boolean;
};

export const UNVERIFIED_COLLECTION_INVOICE: CollectionInvoiceReview = {
  state: 'missing', label: 'Invoice unverified', detail: 'Review the linked invoice in Billing before recording collection follow-up.', outstandingMinor: null, canFollowUp: false,
};

/** A historical collection case is not an invoice ledger or settlement record. */
export function reviewCollectionInvoice(record: Pick<CollectionCase, 'tenantId' | 'estateId' | 'invoiceRef' | 'amountMinor'>, invoices: readonly Invoice[]): CollectionInvoiceReview {
  const invoice = invoices.find((row) => row.ref === record.invoiceRef && row.tenantId === record.tenantId && row.estateId === record.estateId);
  if (!invoice) return { ...UNVERIFIED_COLLECTION_INVOICE, label: 'Invoice not found', detail: 'No linked invoice was found in your authorised records. Review Billing before recording follow-up.' };
  if (invoice.status === 'draft') return { state: 'draft', label: 'Draft invoice', detail: 'This invoice has not been issued. Review Billing before recording collection follow-up.', outstandingMinor: null, canFollowUp: false };
  if (invoice.amount.currency !== 'NGN' || invoice.paid.currency !== invoice.amount.currency) return { state: 'currency_mismatch', label: 'Currency mismatch', detail: 'This NGN case cannot be compared with the linked invoice currency. Review Billing; no conversion is assumed.', outstandingMinor: null, canFollowUp: false };
  if (![invoice.amount.minor, invoice.paid.minor, record.amountMinor].every((value) => Number.isSafeInteger(value) && value >= 0)) return { state: 'invalid_balance', label: 'Balance unverified', detail: 'A valid invoice balance could not be established. Review Billing before recording follow-up.', outstandingMinor: null, canFollowUp: false };
  const outstandingMinor = Math.max(0, invoice.amount.minor - invoice.paid.minor);
  if (!outstandingMinor) return { state: 'paid', label: 'No invoice balance', detail: 'The linked invoice has no recorded outstanding balance. The historical case remains available for review; no reminder, promise or escalation is appropriate.', outstandingMinor, canFollowUp: false };
  if (outstandingMinor !== record.amountMinor) return { state: 'balance_mismatch', label: 'Balance differs', detail: 'The recorded case amount differs from the current linked invoice balance. Review Billing before recording collection follow-up.', outstandingMinor, canFollowUp: false };
  return { state: 'matched', label: 'Invoice balance matched', detail: 'The recorded case amount matches the linked invoice balance. This is not bank settlement evidence.', outstandingMinor, canFollowUp: true };
}
