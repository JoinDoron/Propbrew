import type { Money as MoneyValue } from '@/domain/primitives';

export type Severity = 'critical' | 'high' | 'medium';

export type WoLite = {
  id: string; ref: string; title: string; status: string; priority: string;
  estateId: string; assigneeName: string; respondDueAt: string | null; breached: boolean; cost: MoneyValue | null;
};
export type InvLite = { id: string; ref: string; estateId: string; status: string; amount: MoneyValue; paid: MoneyValue; residentName: string; agingDays: number };
export type SosLite = { id: string; ref: string; estateId: string; status: string; residentName: string; ackSeconds: number | null };
export type RiskLite = { assetId: string; assetName: string; estateId: string; score: number; band: string; topDriver: string; suggestReason?: string };
export type ObLite = { id: string; name: string; estateId: string; criticality: string; validUntil: string | null; scopeLabel: string };
export type OccLite = { id: string; assetName: string; estateId: string; dueDate: string; frequency: string };
export type InspLite = { id: string; ref: string; estateId: string; template: string };
export type GapLite = { id: string; name: string; estateId: string };

export type DashData = {
  now: string;
  scopeLabel: string;
  estates: { id: string; name: string }[];
  flags: { wo: boolean; inv: boolean; sos: boolean; risk: boolean; compliance: boolean };
  workOrders: WoLite[];
  invoices: InvLite[];
  sos: SosLite[];
  risk: RiskLite[];
  obligations: ObLite[];
  ppmOverdue: OccLite[];
  inspectionsOverdue: InspLite[];
  coverageGaps: GapLite[];
};
