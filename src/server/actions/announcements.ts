'use server';

import { withDurableMutation } from '@/server/data/durable-records';

import { nextRecordSequence } from '@/server/data/record-context';

/**
 * EM-04 / AI-E-04 announcement records. The hard rule lives here, server-side: an
 * AI-drafted announcement can NEVER be sent without an explicit manager approval
 * flag. Records are gated on the announcements capability (Estate/Facility
 * Manager). Requested schedules do not enqueue delivery or claim provider sends.
 */

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getActor } from '@/server/session';
import { ForbiddenError, assertCan, matchesScope, type ScopeFilter } from '@/lib/authz';
import { db } from '@/server/data/store';
import { operatingNowISO } from '@/server/operating-clock';
import { BLOCKS, estimateReach, targetSize, type Channel } from '@/domain/announcements';
import { ANNOUNCEMENT_SCOPES, type AnnouncementScope } from '@/domain/enums';

export type SendInput = {
  estateId?: string;
  title: string;
  body: string;
  scope: AnnouncementScope;
  audience: string;
  block?: string;
  channels: Channel[];
  aiDrafted: boolean;
  approved: boolean;
  scheduleAt?: string | null;
};

export type SendResult = { ok: true; reach: number; scheduled: boolean } | { ok: false; error: string };

const messageText = (max: number) => z.string().trim().min(1).max(max).refine((value) => !/[\u0000-\u0008\u000b-\u001f\u007f]/.test(value));
const sendSchema = z.object({
  estateId: z.string().trim().min(1).max(160).optional(), title: messageText(160), body: messageText(10_000),
  scope: z.enum(ANNOUNCEMENT_SCOPES), audience: z.enum(['All residents', 'Owners', 'Tenants', 'Managers', 'Committee']),
  block: z.string().trim().max(100).optional(), channels: z.array(z.enum(['in_app', 'push', 'sms', 'email'])).min(1).max(4),
  aiDrafted: z.boolean(), approved: z.boolean(), scheduleAt: z.iso.datetime({ offset: true }).nullable().optional(),
}).strict();

export async function sendAnnouncement(input: SendInput): Promise<SendResult> {
  return withDurableMutation(async () => {
  const actor = await getActor();
  let scope: ScopeFilter;
  try {
    scope = assertCan(actor, 'announcements', 'transition');
  } catch (e) {
    if (e instanceof ForbiddenError) return { ok: false, error: 'You cannot publish announcements.' };
    throw e;
  }

  const parsed = sendSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Enter valid announcement text, audience, channels and schedule details.' };
  const data = parsed.data;
  // AI-E-04 — approval must be an actual boolean, not a truthy caller value.
  if (data.aiDrafted && !data.approved) {
    return { ok: false, error: 'AI-drafted announcements must be approved by a manager before sending.' };
  }
  if (data.scheduleAt && Date.parse(data.scheduleAt) <= Date.now()) return { ok: false, error: 'Choose a future date and time for this scheduled record.' };
  if (data.scope === 'building' && (!data.block || !Object.hasOwn(BLOCKS, data.block))) return { ok: false, error: 'Choose a recorded building for this announcement.' };
  const estates = db.sites.filter((row) => row.kind === 'estate' && matchesScope({ ...row, siteId: row.id }, scope) && (!data.estateId || row.id === data.estateId));
  if (estates.length !== 1) return { ok: false, error: 'Choose one of your authorised estate properties for this announcement.' };
  const estate = estates[0];
  const size = targetSize(data.scope, data.audience, data.block);
  const reach = estimateReach(size, [...new Set(data.channels)]);
  const scheduled = Boolean(data.scheduleAt);

  db.announcements.unshift({
    tenantId: estate.tenantId,
    id: `an-new-${nextRecordSequence('announcements:counter', 0, true)}`,
    title: data.title,
    body: data.body,
    estateId: estate.id,
    scope: data.scope,
    audience: data.scope === 'building' ? `${data.block} · ${data.audience}` : data.audience,
    scheduleAt: data.scheduleAt ? new Date(data.scheduleAt).toISOString() : null,
    // Publishing an in-app record is not a provider delivery acknowledgement.
    sentAt: scheduled ? null : operatingNowISO(),
    delivered: 0,
    read: 0,
    aiDrafted: data.aiDrafted,
  } as (typeof db.announcements)[number]);

  revalidatePath('/announcements');
  revalidatePath('/estate');
  return { ok: true, reach, scheduled };

  }, 'estate');
}
