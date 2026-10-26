import type { OwnerSetupDraft } from '@/domain/owner-onboarding';

export type OwnerSetupRecord = {
  draft: OwnerSetupDraft;
  version: number;
  completedAt: string | null;
  updatedAt: string | null;
  /** Native company activation reference, committed with the property inventory. */
  activatedProperty?: { id: string; name: string; unitCount: number };
};

export class OnboardingConflictError extends Error {
  constructor() {
    super('Your setup changed in another tab. Reload the latest saved version before continuing.');
    this.name = 'OnboardingConflictError';
  }
}
