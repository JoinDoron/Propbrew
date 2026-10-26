'use server';

import { revalidatePath } from 'next/cache';
import { ownerSetupDraftSchema, validateOwnerCompletion, type OwnerSetupDraft } from '@/domain/owner-onboarding';
import { getOwnerIdentity } from '@/server/onboarding/identity';
import { saveOwnerSetup, completeOwnerSetup, OnboardingConflictError, type OwnerSetupRecord } from '@/server/onboarding/repository';

type SetupResult =
  | { ok: true; record: OwnerSetupRecord }
  | { ok: false; error: string; errors?: Record<string, string> };

async function writeSetup(input: unknown, version: number, complete: boolean, expectedSubject?: string): Promise<SetupResult> {
  const identity = await getOwnerIdentity();
  if (!identity) return { ok: false, error: 'Please sign in with an owner account to save your setup.' };
  // The rendered scope is a binding only. The verified session remains authority.
  if ((identity.mode === 'company' || expectedSubject !== undefined) && expectedSubject !== identity.subject) {
    return { ok: false, error: 'Your company or account changed. Reopen portfolio setup in the company you want to update.' };
  }
  const parsed = ownerSetupDraftSchema.safeParse(input);
  if (!parsed.success || !Number.isSafeInteger(version) || version < 0 || version >= 2_147_483_647) {
    return { ok: false, error: 'Some setup details are invalid. Please review your answers.' };
  }
  const draft: OwnerSetupDraft = parsed.data;
  if (complete) {
    const errors = validateOwnerCompletion(draft);
    if (Object.keys(errors).length) return { ok: false, error: 'Please complete all seven steps before finishing.', errors };
  }
  try {
    const record = complete
      ? await completeOwnerSetup(identity.subject, draft, version)
      : await saveOwnerSetup(identity.subject, draft, version);
    if (identity.mode === 'company') {
      for (const route of ['/onboarding', '/onboarding/complete', '/workspaces', '/estate', '/properties', '/people', '/spaces', '/portfolio']) revalidatePath(route);
    }
    return { ok: true, record };
  } catch (error) {
    if (error instanceof OnboardingConflictError) {
      return { ok: false, error: 'This setup changed in another tab. Refresh this page to load the saved version.' };
    }
    // Do not serialize database errors or property addresses into browser logs.
    return { ok: false, error: 'We could not save your setup. Your answers are still on this page. Please try again.' };
  }
}

export async function saveOwnerSetupAction(draft: unknown, version: number, expectedSubject?: string): Promise<SetupResult> {
  return writeSetup(draft, version, false, expectedSubject);
}

export async function completeOwnerSetupAction(draft: unknown, version: number, expectedSubject?: string): Promise<SetupResult> {
  return writeSetup(draft, version, true, expectedSubject);
}
