import type { Invoice } from '@/domain/entities';
import { money, type Money, type CurrencyCode } from '@/domain/primitives';
/** Derive current receivables from issued ledger records, never cached contacts.
 * The caller supplies already-authorised invoices; ownership is checked again. */
export function residentInvoiceBalances(invoices: readonly Invoice[], tenantId: string, userId: string, unitId: string): { balances: Money[]; invalid: number } {
  const groups = new Map<CurrencyCode, number>();
  let invalid = 0;
  for (const invoice of invoices) {
    if (invoice.tenantId !== tenantId || invoice.ownerUserId !== userId || invoice.unitId !== unitId || invoice.status === 'draft') continue;
    const amount = invoice.amount, paid = invoice.paid;
    if (amount.currency !== paid.currency || !Number.isSafeInteger(amount.minor) || !Number.isSafeInteger(paid.minor)
      || amount.minor < 0 || paid.minor < 0 || paid.minor > amount.minor || invoice.status === 'paid' && amount.minor !== paid.minor) { invalid++; continue; }
    const total = (groups.get(amount.currency) ?? 0) + amount.minor - paid.minor;
    if (!Number.isSafeInteger(total)) { invalid++; continue; }
    groups.set(amount.currency, total);
  }
  return { balances: [...groups].map(([currency, minor]) => money(minor, currency)), invalid };
}
