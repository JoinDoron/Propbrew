'use server';

import { withDurableMutation } from '@/server/data/durable-records';

/**
 * Billing actions. AI-E-03 is assistive only: a manager approves a reminder
 * preview, and NO automated penalty is ever applied. This preview does not
 * queue or send a message; a connected delivery workflow is separate.
 */

import { getActor } from '@/server/session';
import { ForbiddenError, assertCan, matchesScope, type ScopeFilter } from '@/lib/authz';
import { db } from '@/server/data/store';

export type ReminderResult = { ok: true; sent: number } | { ok: false; error: string };

export async function sendReminderCampaign(ownerUserIds: string[]): Promise<ReminderResult> {
  return withDurableMutation(async () => {
  const actor = await getActor();
  let scope: ScopeFilter;
  try {
    scope = assertCan(actor, 'charges_invoicing', 'transition'); // Estate Manager (M)
  } catch (e) {
    if (e instanceof ForbiddenError) return { ok: false, error: 'You cannot run reminder campaigns.' };
    throw e;
  }
  if (!Array.isArray(ownerUserIds) || !ownerUserIds.length || ownerUserIds.length > 200
    || ownerUserIds.some((id) => typeof id !== 'string' || !id.trim() || id.length > 160)) return { ok: false, error: 'Choose 1–200 valid resident accounts.' };
  const recipients = [...new Set(ownerUserIds)];
  const eligible = new Set(db.invoices.filter((invoice) => matchesScope(invoice, scope) && invoice.status !== 'draft'
    && invoice.amount.currency === invoice.paid.currency && invoice.amount.minor > invoice.paid.minor).map((invoice) => String(invoice.ownerUserId)));
  if (recipients.some((id) => !eligible.has(id))) return { ok: false, error: 'One or more selected accounts are unavailable in your authorised outstanding invoices. Refresh Billing and review the selection.' };
  // Preserve the public result shape used by the preview UI; no delivery is claimed.
  return { ok: true, sent: recipients.length };

  });
}
