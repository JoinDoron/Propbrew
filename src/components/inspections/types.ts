import type { FacilityComplianceConfiguration, FacilityComplianceSetup, FacilityInspectionOperation, FacilityComplianceState } from '@/domain/facility/compliance';
import type { ComplianceObligation, Inspection } from '@/domain/entities';

export type ObView = ComplianceObligation & { configuration?: FacilityComplianceConfiguration };
export type InspView = Inspection & { operation?: FacilityInspectionOperation };

export type InspectionsData = {
  now: string;
  canMutate: boolean;
  setup?: FacilityComplianceSetup;
  companyId?: string;
  history?: FacilityComplianceState['audit'];
  /** Keep failed-inspection follow-up in the portal that owns this view. */
  workOrderBasePath?: '/work-orders' | '/estate/work-orders';
  obligations: ObView[];
  inspections: InspView[];
};
