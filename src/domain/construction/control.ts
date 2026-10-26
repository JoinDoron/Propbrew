export type OnboardingStatus = 'pending_review' | 'approved' | 'rejected' | 'suspended';
export type SubcontractorOnboarding = {
  tenantId: string; id: string; name: string; trade: string; contactName: string; phoneE164: string;
  cacNumber: string; insuranceExpiryISO?: string; bankVerified: boolean; hseInducted: boolean;
  projectIds: string[]; status: OnboardingStatus; submittedBy: string; submittedAtISO: string;
  reviewedBy?: string; reviewedAtISO?: string; reviewNote?: string;
};

export type EvidenceSubject = 'daily_report' | 'task' | 'quality_gate' | 'delivery' | 'variation' | 'claim';
export type ConstructionEvidencePack = {
  tenantId: string; id: string; projectId: string; subject: EvidenceSubject; subjectRef: string;
  title: string; mediaRefs: string[]; sha256: string; capturedBy: string; capturedAtISO: string;
  status: 'pending_review' | 'approved' | 'rejected'; reviewedBy?: string; reviewedAtISO?: string; reviewNote?: string;
};

export type FieldApprovalKind = 'progress' | 'quality_gate' | 'delivery' | 'handover';
export type ConstructionFieldApproval = {
  tenantId: string; id: string; projectId: string; kind: FieldApprovalKind; subjectRef: string;
  title: string; summary: string; evidencePackIds: string[]; status: 'pending' | 'approved' | 'rejected';
  requestedBy: string; requestedAtISO: string; decidedBy?: string; decidedAtISO?: string; decisionNote?: string;
};

export type ConstructionClaim = {
  tenantId: string; id: string; ref: string; projectId: string; subcontractorId: string; variationId?: string;
  periodEndISO: string; description: string; claimedMinor: number; assessedMinor?: number; retentionMinor: number;
  retentionPct: number; whtMinor: number; whtPct: number; certifiedMinor?: number; status: 'submitted' | 'assessed' | 'approved' | 'rejected' | 'paid';
  submittedBy: string; submittedAtISO: string; reviewedBy?: string; reviewedAtISO?: string; reviewNote?: string;
};

export type ProcurementPayment = {
  tenantId: string; id: string; ref: string; projectId: string; poId: string; invoiceRef: string;
  invoiceMinor: number; eligibleDeliveredMinor: number; retentionMinor: number; whtMinor: number; payableMinor: number;
  threeWayMatched: boolean; status: 'pending_match' | 'pending_approval' | 'approved' | 'paid' | 'rejected';
  requestedBy: string; requestedAtISO: string; reviewedBy?: string; reviewedAtISO?: string;
  paymentReference?: string; paidAtISO?: string; note?: string;
};

export type ConstructionControlState = {
  subcontractors: SubcontractorOnboarding[];
  evidencePacks: ConstructionEvidencePack[];
  fieldApprovals: ConstructionFieldApproval[];
  claims: ConstructionClaim[];
  payments: ProcurementPayment[];
};

export function emptyConstructionControlState(): ConstructionControlState {
  return { subcontractors: [], evidencePacks: [], fieldApprovals: [], claims: [], payments: [] };
}

export function claimPayableMinor(claimedMinor: number, retentionPct: number, whtPct: number) {
  const retentionMinor = Math.round(claimedMinor * retentionPct / 100);
  const whtMinor = Math.round((claimedMinor - retentionMinor) * whtPct / 100);
  return { retentionMinor, whtMinor, payableMinor: claimedMinor - retentionMinor - whtMinor };
}
