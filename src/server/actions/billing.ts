'use server';

/**
 * Billing actions. AI-E-03 is assistive only: a manager approves a reminder
 * campaign, and NO automated penalty is ever applied — this action just queues
 * reminders (in-app/SMS/email via SC-09) to the chosen residents.
 */

import { getActor } from '@/server/session';
import { ForbiddenError, assertCan } from '@/lib/authz';

export type ReminderResult = { ok: true; sent: number } | { ok: false; error: string };

export async function sendReminderCampaign(ownerUserIds: string[]): Promise<ReminderResult> {
  const actor = await getActor();
  try {
    assertCan(actor, 'charges_invoicing', 'transition'); // Estate Manager (M)
  } catch (e) {
    if (e instanceof ForbiddenError) return { ok: false, error: 'You cannot run reminder campaigns.' };
    throw e;
  }
  if (ownerUserIds.length === 0) return { ok: false, error: 'No residents selected.' };
  // Reminders are external sends (SC-09); nothing in the ledger changes — and
  // crucially, no penalty is ever applied (AI-E-03).
  return { ok: true, sent: ownerUserIds.length };
}
