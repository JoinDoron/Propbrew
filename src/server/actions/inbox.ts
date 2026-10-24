'use server';

import { withDurableMutation } from '@/server/data/durable-records';

/**
 * Inbox actions — mark notifications read, mark a thread read, send a message.
 * All scoped to the current actor (a user can only touch their own inbox).
 */

import { getActor } from '@/server/session';
import { appendMessage, markAllNotificationsRead, markThreadRead } from '@/server/data/inbox';

export async function markNotificationsRead(): Promise<void> {
  return withDurableMutation(async () => {
  const actor = await getActor();
  markAllNotificationsRead(actor.userId, actor.roles);

  });
}

export async function readThread(threadId: string): Promise<void> {
  return withDurableMutation(async () => {
  const actor = await getActor();
  markThreadRead(actor.userId, actor.roles, threadId);

  });
}

export async function sendMessage(threadId: string, text: string): Promise<{ ok: boolean }> {
  return withDurableMutation(async () => {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false };
  const actor = await getActor();
  appendMessage(actor.userId, actor.roles, threadId, trimmed);
  return { ok: true };

  });
}
