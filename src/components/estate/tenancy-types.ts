import type { TenancyStage, DepositStatus } from '@/domain/estate';
import type { Tone } from '@/lib/status-tones';
import type { TenancyAgreementDetails } from '@/domain/estate/tenancy-setup';

export type TenancyRow = {
  id: string;
  residentName: string;
  unitLabel: string;
  stage: TenancyStage;
  applicationISO: string;
  moveInISO?: string;
  leaseEndISO?: string;
  moveOutISO?: string;
  rentMinor: number;
  depositMinor: number;
  depositStatus: DepositStatus;
  agreement?: TenancyAgreementDetails;
};

export const DEPOSIT_TONE: Record<DepositStatus, Tone> = { pending: 'info', held: 'progress', partially_refunded: 'warn', refunded: 'success', withheld: 'danger' };
export const DEPOSIT_LABEL: Record<DepositStatus, string> = { pending: 'Deposit due', held: 'Deposit held', partially_refunded: 'Part-refunded', refunded: 'Refunded', withheld: 'Withheld' };

// Tenancy records currently store rent/deposit amounts in NGN minor units.
export const tenancyMoney = (minor: number) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(minor / 100);
export function tenancyDate(value: string) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat('en-NG', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date);
}

export function canRecordDeposit(t: TenancyRow) {
  return (t.stage === 'moving_out' || t.stage === 'closed') && (t.depositStatus === 'held' || t.depositStatus === 'pending');
}
