import type { ComplianceObligation, Inspection } from '@/domain/entities';

export type ObView = ComplianceObligation;
export type InspView = Inspection;

export type InspectionsData = {
  now: string;
  canMutate: boolean;
  /** Keep failed-inspection follow-up in the portal that owns this view. */
  workOrderBasePath?: '/work-orders' | '/estate/work-orders';
  obligations: ObView[];
  inspections: InspView[];
};
