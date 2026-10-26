import type { PpmOccurrence, AssetRuntime, RiskAssessment } from '@/domain/ppm';
import type { MaintenanceSetupData } from '@/server/reads/facility-maintenance';

/** Serializable views passed from the PPM page (server) into the client shell. */
export type OccView = PpmOccurrence;
export type RiskView = RiskAssessment;

export type PlanView = {
  id: string;
  assetId: string;
  assetName: string;
  category: string;
  frequency: string;
  basis: string;
  leadTimeDays: number;
  runtimeIntervalHours?: number;
  checklist: { id: string; label: string; requiresPhoto: boolean }[];
  evidenceRequired: boolean;
  lastServicedAt: string | null;
  estimatedHours: number;
  assignee: string;
  statutory: boolean;
  statutoryDeadline?: string;
  nextDue: string;
  rescheduleCount: number;
};

export type RuntimeView = AssetRuntime & { assetName: string };

export type GapView = { id: string; name: string; category: string; locationLabel: string; status: string };

export type PpmData = {
  setup?: MaintenanceSetupData;
  now: string;
  canMutate: boolean;
  occurrences: OccView[];
  plans: PlanView[];
  assessments: RiskView[];
  runtime: RuntimeView[];
  gaps: GapView[];
  weeklyCapacityHours: number;
};
