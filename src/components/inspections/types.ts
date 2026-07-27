import type { ComplianceObligation, Inspection } from '@/domain/entities';

export type ObView = ComplianceObligation;
export type InspView = Inspection;

export type InspectionsData = {
  now: string;
  canMutate: boolean;
  obligations: ObView[];
  inspections: InspView[];
};
