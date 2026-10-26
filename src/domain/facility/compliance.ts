import { z } from 'zod';
import type { InspectionItem } from '@/domain/entities';

export const COMPLIANCE_TEMPLATE_KEYS = ['fire', 'lift', 'water', 'generator', 'electrical', 'document', 'general'] as const;
export const complianceText = (min: number, max: number) => z.string().trim().min(min).max(max).refine((value) => !/[\u0000-\u001f\u007f]/.test(value));
export function complianceDateValid(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1900-01-01' || value > '2100-12-31') return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}
export const complianceDate = z.string().refine(complianceDateValid, 'Enter a real date between 1900 and 2100.');
export const complianceChecklistSchema = z.array(z.strictObject({ id: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/), label: complianceText(2, 240), severity: z.enum(['minor', 'major', 'critical']), requiresPhoto: z.boolean() }))
  .min(1).max(60).refine((items) => new Set(items.map((item) => item.id)).size === items.length, 'Checklist item identifiers must be unique.');
export const complianceObligationFields = z.strictObject({
  expectedCompanyId: complianceText(1, 160), siteId: complianceText(1, 160), assetId: complianceText(1, 160).nullable(),
  name: complianceText(2, 160), scopeLabel: complianceText(2, 180), criticality: z.enum(['statutory', 'important', 'routine']),
  cadenceDays: z.number().int().min(1).max(3650), templateKey: z.enum(COMPLIANCE_TEMPLATE_KEYS), templateName: complianceText(2, 180),
  checklist: complianceChecklistSchema, authority: complianceText(0, 160), certificateReference: complianceText(0, 160),
  validUntil: complianceDate.nullable(), nextDueDate: complianceDate.optional(), idempotencyKey: z.uuid(),
}).refine((value) => value.validUntil === null || value.certificateReference.length >= 2, { message: 'Record a certificate reference when recording its expiry.', path: ['certificateReference'] });
export type ComplianceObligationInput = z.infer<typeof complianceObligationFields>;
export type FacilityComplianceConfiguration = {
  tenantId: string; obligationId: string; siteId: string; assetId: string | null; version: number;
  templateName: string; checklist: Omit<InspectionItem, 'result' | 'note'>[];
  certificateReference: string; nextOperationalDue: string | null; lastOperationalInspectionRef?: string;
  createdAt: string; createdBy: string; updatedAt: string; updatedBy: string;
};
export type FacilityInspectionOperation = {
  tenantId: string; inspectionId: string; obligationId: string; version: number; obligationVersion: number;
  checklistHash: string; scopeHash: string; scheduledDate: string; cadenceDays: number;
  evidenceIds: string[]; completedAt?: string;
};
export type FacilityComplianceResult = { ok: true; id?: string; ref?: string; raised?: number; passed?: boolean } | { ok: false; error: string };
export type FacilityComplianceState = {
  configurations: FacilityComplianceConfiguration[]; runs: FacilityInspectionOperation[];
  receipts: { tenantId: string; actorId: string; operation: string; key: string; payloadHash: string; result: FacilityComplianceResult }[];
  audit: { tenantId: string; actorId: string; obligationId: string; inspectionId?: string; action: string; at: string; note?: string; from?: string; to?: string }[];
};
export type FacilityComplianceSetup = { companyId: string; sites: { id: string; name: string }[]; assets: { id: string; name: string; siteId: string }[] };
