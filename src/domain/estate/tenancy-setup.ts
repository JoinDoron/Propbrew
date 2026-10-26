import { z } from 'zod';

export const RENT_FREQUENCIES = ['monthly', 'quarterly', 'yearly'] as const;
export type RentFrequency = typeof RENT_FREQUENCIES[number];
export const RENT_FREQUENCY_LABELS: Record<RentFrequency, string> = { monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Yearly' };
const text = (max: number) => z.string().trim().max(max).refine((value) => !/[\u0000-\u001f\u007f]/.test(value));
export function tenancyDateValid(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1900-01-01' || value > '2100-12-31') return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}
/** Decimal NGN input is parsed without floating-point multiplication. */
export function tenancyMinor(value: string, positive = false): number | null {
  if (typeof value !== 'string' || value.length > 24 || !/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(value.trim())) return null;
  const [whole, fraction = ''] = value.trim().split('.');
  const minor = BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, '0'));
  if (minor > BigInt(Number.MAX_SAFE_INTEGER) || (positive && minor === BigInt(0))) return null;
  return Number(minor);
}
export const tenancyAgreementInputSchema = z.strictObject({
  companyScope: text(160).min(1), residentId: text(160).min(1), expectedUnitId: text(160).min(1),
  startDate: z.string().refine(tenancyDateValid), endDate: z.string().refine(tenancyDateValid),
  rentAmount: z.string().max(24).refine((value) => tenancyMinor(value, true) !== null),
  depositAmount: z.string().max(24).refine((value) => tenancyMinor(value) !== null),
  rentFrequency: z.enum(RENT_FREQUENCIES), agreementReference: text(120), notes: z.string().trim().max(2000).refine((value) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)), idempotencyKey: z.uuid(),
}).refine((value) => value.endDate > value.startDate, { message: 'Lease end must be after its start date.', path: ['endDate'] });
export type TenancyAgreementInput = z.infer<typeof tenancyAgreementInputSchema>;
export type TenancyAgreementDetails = {
  tenantId: string; tenancyId: string; residentId: string; unitId: string; estateId: string;
  startDate: string; endDate: string; rentFrequency: RentFrequency; agreementReference: string; notes: string;
  version: number; createdAt: string; createdBy: string; updatedAt: string; updatedBy: string;
};
export type TenancyResidentOption = { id: string; name: string; unitId: string; unitLabel: string; estateName: string };
export type TenancySetupState = {
  agreements: TenancyAgreementDetails[];
  receipts: { tenantId: string; actorId: string; key: string; operation: 'create' | 'update'; payloadHash: string; tenancyId: string; name: string }[];
  audit: { tenantId: string; actorId: string; tenancyId: string; estateId: string; action: 'agreement.created' | 'agreement.updated' | 'stage.changed'; at: string; from?: string; to?: string }[];
};
