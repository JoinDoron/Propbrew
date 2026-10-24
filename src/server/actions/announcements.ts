'use server';

/**
 * EM-04 / AI-E-04 announcement send. The hard rule lives here, server-side: an
 * AI-drafted announcement can NEVER be sent without an explicit manager approval
 * flag. Sends are gated on the announcements capability (Estate/Facility Manager)
 * and land in the mutable store so delivery/read analytics update live.
 */

import { revalidatePath } from 'next/cache';
import { getActor } from '@/server/session';
import { ForbiddenError, assertCan } from '@/lib/authz';
import { db } from '@/server/data/store';
import { NOW } from '@/domain/ppm';
import { estimateReach, targetSize, type Channel } from '@/domain/announcements';
import type { AnnouncementScope } from '@/domain/enums';

export type SendInput = {
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

let counter = 0;

export async function sendAnnouncement(input: SendInput): Promise<SendResult> {
  const actor = await getActor();
  try {
    assertCan(actor, 'announcements', 'transition');
  } catch (e) {
    if (e instanceof ForbiddenError) return { ok: false, error: 'You cannot publish announcements.' };
    throw e;
  }

  // AI-E-04 — the non-negotiable: no AI-drafted send without manager approval.
  if (input.aiDrafted && !input.approved) {
    return { ok: false, error: 'AI-drafted announcements must be approved by a manager before sending.' };
  }
  if (!input.title.trim() || !input.body.trim()) return { ok: false, error: 'A title and body are required.' };
  if (input.channels.length === 0) return { ok: false, error: 'Select at least one delivery channel.' };

  const size = targetSize(input.scope, input.audience, input.block);
  const reach = estimateReach(size, input.channels);
  const scheduled = Boolean(input.scheduleAt);
  const estateId = actor.estateIds[0] ?? 'est-gardens';

  db.announcements.unshift({
    tenantId: actor.tenantId,
    id: `an-new-${++counter}`,
    title: input.title.trim(),
    body: input.body.trim(),
    estateId,
    scope: input.scope,
    audience: input.audience,
    // Scheduled sends stay unsent (sentAt null) until their time; immediate sends
    // stamp NOW and seed delivery so the read-rate bars animate from zero.
    sentAt: scheduled ? null : NOW,
    delivered: scheduled ? 0 : reach,
    read: 0,
    aiDrafted: input.aiDrafted,
  } as (typeof db.announcements)[number]);

  revalidatePath('/announcements');
  revalidatePath('/estate');
  return { ok: true, reach, scheduled };
}
